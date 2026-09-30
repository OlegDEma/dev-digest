import type { PrIntentRecord, PrIntentResponse, UnifiedDiff, IntentSource } from '@devdigest/shared';
import { classifyIntent } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository, type PullRow } from '../reviews/repository.js';
import { loadDiff } from '../reviews/diff-loader.js';
import type { RepoRow } from '../../db/rows.js';
import { IntentRepository } from './repository.js';
import { collectIntentSources } from './sources.js';
import { redactUrl } from './helpers.js';
import { emitPromptAssembled, promptLogMode } from '../../platform/prompt-log.js';


/**
 * Where classifier progress goes: the RunLogger during a review run, a pino
 * adapter for the standalone POST. Payloads never carry body/doc/diff text.
 */
export interface IntentLog {
  info(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/** Where `prompt.assembled` goes for the classifier call, plus the run ids it serves (review only). */
export type IntentPromptLogCtx = {
  logger?: Pick<PinoLike, 'info' | 'warn' | 'error'>;
  runIds?: string[];
};

export function pinoIntentLog(logger: Pick<PinoLike, 'info' | 'error'>): IntentLog {
  return {
    info: (m, d) => logger.info(d ?? {}, m),
    error: (m, d) => logger.error(d ?? {}, m),
  };
}

const sha7 = (sha: string | null) => (sha ?? 'unknown').slice(0, 7);

/**
 * Derives, stores and serves a PR's intent. Owns `pr_intent` via
 * IntentRepository; reuses ReviewRepository/loadDiff for PR + diff access.
 */
export class IntentService {
  constructor(
    private readonly container: Container,
    private readonly reviews: ReviewRepository = new ReviewRepository(container.db),
    private readonly intents: IntentRepository = new IntentRepository(container.db),
  ) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const intent = (await this.intents.get(prId)) ?? null;
    return { intent, stale: !!intent && intent.head_sha !== pull.headSha };
  }

  async recompute(
    workspaceId: string,
    prId: string,
    logger: Pick<PinoLike, 'info' | 'warn' | 'error'>,
  ): Promise<PrIntentResponse> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.reviews.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const diff = await loadDiff(this.container, this.reviews, workspaceId, pull, repo);
    const intent = await this.derive(workspaceId, pull, repo, diff, pinoIntentLog(logger), { logger });
    return { intent, stale: false };
  }

  /**
   * Intent for a review run: the stored one if any (not auto-recomputed, even
   * when stale), else classify once and persist. NEVER throws — a failure is
   * logged and the review proceeds without intent.
   */
  async forReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLog,
    promptLog?: IntentPromptLogCtx,
  ): Promise<PrIntentRecord | undefined> {
    try {
      const stored = await this.intents.get(pull.id);
      if (stored) {
        log.info(`Using stored PR intent (derived at ${sha7(stored.head_sha)})`);
        if (stored.head_sha !== pull.headSha) {
          log.info(
            `Stored PR intent is stale: PR head moved ${sha7(stored.head_sha)} → ${sha7(pull.headSha)} (not recomputed)`,
          );
        }
        return stored;
      }
      return await this.derive(workspaceId, pull, repo, diff, log, promptLog);
    } catch (err) {
      log.error(`Intent classification failed — reviewing without intent: ${(err as Error).message}`);
      return undefined;
    }
  }

  async derive(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLog,
    promptLog?: IntentPromptLogCtx,
  ): Promise<PrIntentRecord> {
    const { tokenizer } = this.container;
    const body = pull.body ?? '';
    const collected = await collectIntentSources(
      this.container,
      { owner: repo.owner, name: repo.name },
      pull,
    );

    const choice = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(choice.provider);

    const sessionId = `${repo.owner}/${repo.name}#${pull.number}:intent`;
    const result = await classifyIntent({
      llm,
      model: choice.model,
      title: pull.title,
      body,
      sources: collected,
      diff,
      requireParameters: true,
      sessionId,
      onPrompt: ({ sections, fileList }) => {
        const refsOf = (kind: string) =>
          collected.filter((c) => c.kind === kind && c.status === 'used').map((c) => c.ref);
        const namesFor = (name: string): string[] | undefined =>
          name === 'issues'
            ? refsOf('issue')
            : name === 'docs'
              ? refsOf('repo_doc')
              : name === 'urls'
                ? refsOf('url').map(redactUrl)
                : undefined;
        const callId = emitPromptAssembled(promptLog?.logger, promptLogMode(this.container), tokenizer, {
          feature: 'intent',
          provider: choice.provider,
          model: choice.model,
          prId: pull.id,
          runIds: promptLog?.runIds,
          sessionId,
          sections: sections.map((s) => ({ name: s.name, text: s.text, itemNames: namesFor(s.name) })),
        });
        const sectionTokens = sections.map((s) => ({ name: s.name, tokens: tokenizer.count(s.text) }));
        const fileListTokens = tokenizer.count(fileList);
        const diffTokens = tokenizer.count(diff.raw);
        // Composition goes in the message text too: the Live Log UI and the
        // persisted run trace render `msg` only, never `data`.
        const promptTokens = sectionTokens.reduce((n, s) => n + s.tokens, 0);
        const parts = sectionTokens.filter((s) => s.tokens > 0).map((s) => `${s.name} ${s.tokens}`).join(', ');
        const srcSummary = collected.map((s) => `${s.kind}:${s.status}`).join(', ') || 'none linked';
        log.info(
          `Intent classifier → ${choice.provider}/${choice.model} · prompt ≈${promptTokens} tok (${parts}) · ` +
            `diff bodies not sent: ${diffTokens} → file list ${fileListTokens} tok, saved ${diffTokens - fileListTokens} · ` +
            `sources: ${srcSummary}` +
            (callId ? ` · call_id=${callId}` : ''),
          {
          model: choice.model,
          sections: sectionTokens,
          prompt_tokens: promptTokens,
          diff_tokens: diffTokens,
          file_list_tokens: fileListTokens,
          diff_tokens_saved: diffTokens - fileListTokens,
          sources: collected.map((s) => ({
            kind: s.kind,
            ref: s.ref,
            status: s.status,
            tokens: s.status === 'used' ? tokenizer.count(s.text) : 0,
          })),
        });
      },
    });

    const fileListTokens = tokenizer.count(result.fileList);
    const sources: IntentSource[] = [
      { kind: 'pr_title', ref: 'title', status: 'used', reason: null, tokens: tokenizer.count(pull.title) },
      body.trim()
        ? { kind: 'pr_body', ref: 'body', status: 'used', reason: null, tokens: tokenizer.count(body) }
        : { kind: 'pr_body', ref: 'body', status: 'skipped', reason: 'empty description', tokens: 0 },
      ...collected.map(
        (s): IntentSource => ({
          kind: s.kind,
          ref: s.ref,
          status: s.status,
          reason: s.reason,
          tokens: s.status === 'used' ? tokenizer.count(s.text) : 0,
        }),
      ),
      { kind: 'file_list', ref: 'changed files', status: 'used', reason: null, tokens: fileListTokens },
    ];

    const record: PrIntentRecord = {
      ...result.intent,
      pr_id: pull.id,
      head_sha: pull.headSha,
      sources,
      model: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      diff_tokens_saved: tokenizer.count(diff.raw) - fileListTokens,
      computed_at: new Date().toISOString(),
    };
    await this.intents.upsert(record);

    log.info(
      `Intent derived — confidence=${record.confidence}, in_scope=${record.in_scope.length}, ` +
        `out_of_scope=${record.out_of_scope.length}, tokens ${record.tokens_in}/${record.tokens_out}, ` +
        `$${(record.cost_usd ?? 0).toFixed(4)}`,
      {
        model: record.model,
        tokens_in: record.tokens_in,
        tokens_out: record.tokens_out,
        cost_usd: record.cost_usd,
        diff_tokens_saved: record.diff_tokens_saved,
      },
    );
    return record;
  }
}
