import type { PrHistoryResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { ReviewRepository } from '../reviews/repository.js';
import { CACHE_MAX, CACHE_TTL_MS, MAX_COMMITS, MAX_FILES, MAX_PRIOR_PRS, PER_FILE_COMMITS } from './constants.js';
import { pickFiles, toPrHistory } from './helpers.js';

const none = (available: boolean, reason: PrHistoryResponse['reason']): PrHistoryResponse => ({
  history: [],
  available,
  reason,
});

/**
 * Prior merged PRs that touched the same files as this PR, via the GitHub port.
 * Results are cached in process memory per (PR, head SHA); only available ones.
 */
export class HistoryService {
  private cache = new Map<string, { at: number; value: PrHistoryResponse }>();

  constructor(
    private readonly container: Container,
    private readonly reviews: ReviewRepository = new ReviewRepository(container.db),
  ) {}

  async get(
    workspaceId: string,
    prId: string,
    logger: Pick<PinoLike, 'info' | 'warn'>,
  ): Promise<PrHistoryResponse> {
    const started = Date.now();
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const prFiles = await this.reviews.getPrFiles(prId);
    const files = pickFiles(prFiles, MAX_FILES);
    if (files.length === 0) return none(true, null);

    const key = `${prId}:${pull.headSha}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      logger.info({ pr_id: prId, files: files.length, prs: hit.value.history.length, cached: true, ms: Date.now() - started }, 'history.read');
      return hit.value;
    }

    try {
      const github = await this.container.github();
      const repo = await this.reviews.getRepo(pull.repoId);
      if (!repo) throw new NotFoundError('Repository not found');
      const rows = await github.listPrsTouchingFiles({ owner: repo.owner, name: repo.name }, files, pull.number, {
        maxFiles: MAX_FILES,
        perFileCommits: PER_FILE_COMMITS,
        maxCommits: MAX_COMMITS,
      });
      const value: PrHistoryResponse = {
        history: toPrHistory(rows, pull.number, MAX_PRIOR_PRS),
        available: true,
        reason: null,
      };
      this.store(key, value);
      logger.info({ pr_id: prId, files: files.length, prs: value.history.length, cached: false, ms: Date.now() - started }, 'history.read');
      return value;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (err instanceof ConfigError) return none(false, 'no_token');
      logger.warn({ pr_id: prId, err: (err as Error).message }, 'history.unavailable');
      return none(false, 'github_error');
    }
  }

  private store(key: string, value: PrHistoryResponse) {
    this.cache.delete(key);
    this.cache.set(key, { at: Date.now(), value });
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
