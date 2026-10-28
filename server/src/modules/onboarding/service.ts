import { randomUUID } from 'node:crypto';
import {
  isStructuredOutputError,
  type OnboardingLastFailure,
  type OnboardingLlmUsage,
  type OnboardingSkeletonReason,
  type OnboardingTour,
  type OnboardingTourResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError } from '../../platform/errors.js';
import { emitPromptAssembled, promptLogMode } from '../../platform/prompt-log.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import type { OnboardingIndexStats, OnboardingSnapshot } from '../repo-intel/types.js';
import { gatherCloneFacts, type CloneFacts } from './clone-facts.js';
import {
  LLM_TIMEOUT_MS,
  LOCK_TTL_MS,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_SCHEMA_NAME,
  NARRATIVE_TEMPERATURE,
} from './constants.js';
import {
  NO_LLM,
  buildFacts,
  buildGeneratedRecord,
  buildIndexSummary,
  buildTour,
  buildTourContext,
  fitFacts,
  preLlmSkeletonReason,
} from './helpers.js';
import { NarrativeSchema, buildSystemPrompt, buildUserMessage, type Narrative } from './prompt.js';
import { OnboardingRepository } from './repository.js';

export interface OnboardingServiceOptions {
  llmTimeoutMs?: number;
  lockTtlMs?: number;
}

type Logger = Pick<PinoLike, 'info' | 'warn'>;

const TIMEOUT = Symbol('onboarding.llm_timeout');

const UNAVAILABLE_STATS: OnboardingIndexStats = {
  enabled: false,
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  lastIndexedSha: null,
  totalCandidates: null,
  bounded: null,
  hotnessAvailable: false,
};

/**
 * Onboarding Tour application service. Reads never generate; a generation makes
 * at most one logical structured LLM call. All DB access is in the two
 * repositories, all clone I/O in `container.cloneFiles`, all LLM I/O in
 * `container.llm()`.
 */
export class OnboardingService {
  private repos: RepoRepository;
  private repo: OnboardingRepository;
  private llmTimeoutMs: number;
  private lockTtlMs: number;

  constructor(
    private container: Container,
    opts: OnboardingServiceOptions = {},
  ) {
    this.repos = new RepoRepository(container.db);
    this.repo = new OnboardingRepository(container.db);
    this.llmTimeoutMs = opts.llmTimeoutMs ?? LLM_TIMEOUT_MS;
    this.lockTtlMs = opts.lockTtlMs ?? LOCK_TTL_MS;
  }

  private async repoOf(workspaceId: string, repoId: string): Promise<RepoRow> {
    const row = await this.repos.getById(workspaceId, repoId);
    if (!row) throw new AppError('repo_not_found', 'Repository not found', 404);
    return row;
  }

  private async cloneAvailable(row: RepoRow): Promise<boolean> {
    if (!row.clonePath) return false;
    try {
      return await this.container.cloneFiles.rootExists(row.clonePath);
    } catch {
      return false;
    }
  }

  private async indexStats(repoId: string): Promise<OnboardingIndexStats> {
    try {
      return await this.container.repoIntel.getOnboardingIndexStats(repoId);
    } catch {
      return UNAVAILABLE_STATS;
    }
  }

  private async response(
    row: RepoRow,
    generationInProgress: boolean,
    stored?: Awaited<ReturnType<OnboardingRepository['getStored']>>,
  ): Promise<OnboardingTourResponse> {
    const [s, stats, cloneOk] = await Promise.all([
      stored === undefined ? this.repo.getStored(row.id) : Promise.resolve(stored),
      this.indexStats(row.id),
      this.cloneAvailable(row),
    ]);
    return {
      repo_id: row.id,
      repo_full_name: row.fullName,
      tour: s?.tour ?? null,
      current_index: buildIndexSummary(stats, cloneOk),
      generation_in_progress: generationInProgress,
      last_failure: s?.last_failure ?? null,
    };
  }

  /** GET: stored tour + lock state. Never generates, never walks the clone. */
  async read(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const row = await this.repoOf(workspaceId, repoId);
    const locked = await this.repo.isLocked(row.id, this.lockTtlMs);
    return this.response(row, locked);
  }

  /** POST: 404 -> 409 (lock) -> one generation -> 200 with the tour. */
  async generate(workspaceId: string, repoId: string, logger?: Logger): Promise<OnboardingTourResponse> {
    const row = await this.repoOf(workspaceId, repoId);
    const lockId = randomUUID();
    if (!(await this.repo.tryAcquireLock(row.id, lockId, this.lockTtlMs))) {
      throw new AppError(
        'generation_in_progress',
        'A generation is already running for this repository',
        409,
      );
    }
    try {
      return await this.run(workspaceId, row, logger);
    } finally {
      await this.repo.releaseLock(row.id, lockId).catch(() => {});
    }
  }

  private async run(workspaceId: string, row: RepoRow, logger?: Logger): Promise<OnboardingTourResponse> {
    const startedAt = Date.now();
    const stored = await this.repo.getStored(row.id);
    const choice = await resolveFeatureModel(this.container, workspaceId, 'onboarding');

    // ---- one snapshot for the whole generation (AC-22) ----
    let snapshot: OnboardingSnapshot = { ...UNAVAILABLE_STATS, files: [], edgeCount: 0, repoMap: null };
    try {
      snapshot = await this.container.repoIntel.getOnboardingSnapshot(row.id);
    } catch {
      /* index_unavailable below */
    }
    let cloneOk = await this.cloneAvailable(row);
    let clone: CloneFacts | null = null;
    if (cloneOk) {
      try {
        clone = await gatherCloneFacts(this.container.cloneFiles, row.clonePath!);
      } catch {
        cloneOk = false;
      }
    }

    const ctx = buildTourContext({
      generatedAt: new Date().toISOString(),
      repo: { fullName: row.fullName, defaultBranch: row.defaultBranch },
      stats: snapshot,
      cloneAvailable: cloneOk,
      files: snapshot.files,
      clone,
    });

    let reason: OnboardingSkeletonReason | null = preLlmSkeletonReason({
      cloneAvailable: cloneOk,
      stats: snapshot,
      edgeCount: snapshot.edgeCount,
    });
    let llm: OnboardingLlmUsage = NO_LLM;
    let narrative: Narrative | null = null;
    let factsTokens = 0;
    let factsTruncated = false;

    if (reason === null) {
      let provider: Awaited<ReturnType<Container['llm']>> | null = null;
      try {
        provider = await this.container.llm(choice.provider);
      } catch (e) {
        reason = e instanceof ConfigError ? 'llm_not_configured' : 'llm_failed';
      }
      if (provider) {
        const fitted = fitFacts(buildFacts(ctx, snapshot.repoMap, this.container.tokenizer), this.container.tokenizer);
        factsTokens = fitted.tokens;
        factsTruncated = fitted.truncated;
        const callId = randomUUID();
        const system = await buildSystemPrompt();
        const user = buildUserMessage(fitted.facts);
        emitPromptAssembled(logger, promptLogMode(this.container), this.container.tokenizer, {
          feature: 'onboarding',
          provider: choice.provider,
          model: choice.model,
          repoId: row.id,
          callId,
          sections: [
            { name: 'system', text: system },
            { name: 'facts', text: user },
          ],
        });
        const base = { calls: 1 as const, call_id: callId, provider: choice.provider, model: choice.model };
        const outcome = await this.callModel(provider, choice.model, system, user);
        if (outcome.kind === 'ok') {
          narrative = outcome.data;
          llm = {
            ...base,
            model: outcome.model,
            attempts: outcome.attempts,
            tokens_in: outcome.tokensIn,
            tokens_out: outcome.tokensOut,
            cost_usd: outcome.costUsd,
          };
        } else {
          reason = outcome.reason;
          llm = {
            ...base,
            attempts: outcome.attempts,
            tokens_in: outcome.tokensIn,
            tokens_out: outcome.tokensOut,
            cost_usd: outcome.costUsd,
          };
        }
      }
    }

    const tour = buildTour({ ctx, narrative, skeletonReason: reason, llm, factsTruncated });

    // ---- keep-vs-replace (D9) ----
    let result: Awaited<ReturnType<OnboardingRepository['getStored']>>;
    if (tour.mode === 'skeleton' && stored?.tour.mode === 'narrative') {
      const lastFailure: OnboardingLastFailure = {
        at: new Date().toISOString(),
        reason: tour.skeleton_reason!,
        provider: choice.provider,
        attempts: llm.attempts,
      };
      await this.repo.keepTourSetFailure(row.id, lastFailure);
      result = { v: 1, tour: stored.tour, last_failure: lastFailure };
    } else {
      await this.repo.replaceTour(row.id, tour);
      result = { v: 1, tour, last_failure: null };
    }

    this.logGenerated(logger, row.id, tour, factsTokens, Date.now() - startedAt);
    return this.response(row, false, result);
  }

  private async callModel(
    provider: Awaited<ReturnType<Container['llm']>>,
    model: string,
    system: string,
    user: string,
  ): Promise<
    | { kind: 'ok'; data: Narrative; model: string; attempts: number; tokensIn: number; tokensOut: number; costUsd: number | null }
    | {
        kind: 'fail';
        reason: 'llm_failed' | 'llm_invalid_output' | 'llm_timeout';
        attempts: number | null;
        tokensIn: number | null;
        tokensOut: number | null;
        costUsd: number | null;
      }
  > {
    const unknown = { attempts: null, tokensIn: null, tokensOut: null, costUsd: null };
    const call = provider.completeStructured({
      model,
      schema: NarrativeSchema,
      schemaName: NARRATIVE_SCHEMA_NAME,
      temperature: NARRATIVE_TEMPERATURE,
      maxTokens: NARRATIVE_MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    // The port has no abort: a call that loses the race may still finish; it must not become an unhandled rejection.
    void call.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), this.llmTimeoutMs);
    });
    try {
      const res = await Promise.race([call, deadline]);
      if (res === TIMEOUT) return { kind: 'fail', reason: 'llm_timeout', ...unknown };
      return {
        kind: 'ok',
        data: res.data,
        model: res.model,
        attempts: res.attempts,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      };
    } catch (e) {
      if (isStructuredOutputError(e)) {
        return {
          kind: 'fail',
          reason: 'llm_invalid_output',
          attempts: e.attempts,
          tokensIn: e.tokensIn,
          tokensOut: e.tokensOut,
          costUsd: e.costUsd,
        };
      }
      return { kind: 'fail', reason: 'llm_failed', ...unknown };
    } finally {
      clearTimeout(timer);
    }
  }

  private logGenerated(
    logger: Logger | undefined,
    repoId: string,
    tour: OnboardingTour,
    factsTokens: number,
    durationMs: number,
  ): void {
    try {
      logger?.info(buildGeneratedRecord({ repoId, tour, factsTokens, durationMs }), 'onboarding.generated');
    } catch {
      /* logging must never fail a generation */
    }
  }
}

