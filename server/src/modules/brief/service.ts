import {
  isStructuredOutputError,
  PrBrief,
  type PrBriefResponse,
  type BriefMissingInput,
} from '@devdigest/shared';
import { generateBrief } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { emitPromptAssembled, promptLogMode } from '../../platform/prompt-log.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { IntentRepository } from '../intent/repository.js';
import { BlastService } from '../blast/service.js';
import { BRIEF_TIMEOUT_MS } from './constants.js';
import { briefLogPayload, toStoredBrief, type BriefOutcome } from './helpers.js';
import { collectBriefInputs, type BriefInputDeps, type SpecAttachments } from './inputs.js';
import { BriefRepository } from './repository.js';

type Logger = Pick<PinoLike, 'info' | 'warn' | 'error'>;

const TIMEOUT = Symbol('brief-timeout');

/**
 * Generates, stores and serves a PR's Why + Risk brief. Owns `pr_brief` via
 * BriefRepository. The lock is per process: one generation per PR at a time.
 */
export class BriefService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly container: Container,
    private readonly reviews: ReviewRepository = new ReviewRepository(container.db),
    private readonly briefs: BriefRepository = new BriefRepository(container.db),
    private readonly intents: IntentRepository = new IntentRepository(container.db),
    private readonly blast: BriefInputDeps['blast'] = new BlastService(container, reviews),
    private readonly timeoutMs: number = BRIEF_TIMEOUT_MS,
  ) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const parsed = PrBrief.safeParse(await this.briefs.get(prId));
    if (!parsed.success) return { brief: null, stale: false };
    return { brief: parsed.data, stale: parsed.data.head_sha !== pull.headSha };
  }

  async generate(workspaceId: string, prId: string, logger: Logger): Promise<PrBriefResponse> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.reviews.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    if (this.inFlight.has(prId)) {
      throw new AppError('brief_in_progress', 'A brief is already being generated for this pull request', 409);
    }
    this.inFlight.add(prId);

    const started = Date.now();
    let outcome: BriefOutcome = 'ok';
    let provider: string | undefined;
    let model: string | undefined;
    let missing: BriefMissingInput[] | undefined;
    let stored: PrBrief | undefined;
    let sectionTokens: { name: string; tokens: number }[] | undefined;
    let called = false;
    let failure: { attempts: number; tokensOut: number; costUsd: number | null } | undefined;
    try {
      // Model choice and key are resolved once, before any input is read.
      const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      provider = choice.provider;
      model = choice.model;
      let llm;
      try {
        llm = await this.container.llm(choice.provider);
      } catch (e) {
        if (e instanceof ConfigError) {
          throw new ConfigError(`No API key configured for ${choice.provider}. Add one in Settings.`);
        }
        throw e;
      }

      // Attach lists are snapshotted here, with the model choice, before any slow input read.
      const attachments: SpecAttachments = await this.briefs
        .listSpecAttachments(workspaceId)
        .then((rows) => ({ rows }), (e: unknown) => ({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }));

      const inputs = await collectBriefInputs(
        this.container,
        { reviews: this.reviews, intents: this.intents, blast: this.blast },
        { workspaceId, pull, repo, logger, attachments },
      );
      missing = inputs.missing;

      const { tokenizer } = this.container;
      const sessionId = `${repo.owner}/${repo.name}#${pull.number}:brief`;
      const call = generateBrief({
        llm,
        model: choice.model,
        facts: inputs.facts,
        count: (s) => tokenizer.count(s),
        sessionId,
        onPrompt: ({ sections }) => {
          called = true;
          sectionTokens = sections.map((s) => ({ name: s.name, tokens: s.tokens }));
          emitPromptAssembled(logger, promptLogMode(this.container), tokenizer, {
            feature: 'brief',
            provider: choice.provider,
            model: choice.model,
            prId: pull.id,
            sessionId,
            sections: sections.map((s) => ({ name: s.name, text: s.text })),
          });
        },
      });
      // The port has no abort: a call that loses the race may still finish; it must not become an unhandled rejection.
      void call.catch(() => {});
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), this.timeoutMs);
      });
      let result;
      try {
        const raced = await Promise.race([call, deadline]);
        if (raced === TIMEOUT) {
          outcome = 'timeout';
          throw new ExternalServiceError('Brief generation timed out. Try again.');
        }
        result = raced;
      } catch (e) {
        if (e instanceof AppError) throw e;
        outcome = 'external_service_error';
        if (isStructuredOutputError(e)) {
          failure = { attempts: e.attempts, tokensOut: e.tokensOut, costUsd: e.costUsd };
        }
        throw new ExternalServiceError(
          isStructuredOutputError(e)
            ? 'Brief generation failed: the model returned an invalid answer.'
            : 'Brief generation failed: the model call did not complete.',
        );
      } finally {
        clearTimeout(timer);
      }

      stored = toStoredBrief({
        result,
        provider: choice.provider,
        headSha: pull.headSha,
        intent: inputs.intentSnapshot,
        blast: inputs.blastSnapshot,
        missing: inputs.missing,
        specs: inputs.specEntries,
      });
      await this.briefs.upsert(prId, stored);
      return { brief: stored, stale: false };
    } catch (e) {
      if (outcome === 'ok') outcome = e instanceof ConfigError ? 'config_error' : 'external_service_error';
      throw e;
    } finally {
      this.inFlight.delete(prId);
      try {
        logger.info(
          briefLogPayload({
            outcome, prId, provider, model, missing, sectionTokens, called, failure, brief: stored, ms: Date.now() - started,
          }),
          'brief.generated',
        );
      } catch {
        /* logging must never fail the request */
      }
    }
  }
}
