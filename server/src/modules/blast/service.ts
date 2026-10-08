import type { PrBlastResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { ReviewRepository } from '../reviews/repository.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import { blastStatus, toPrBlastResponse } from './helpers.js';

/**
 * Blast radius of a PR: reads the prepared repo-intel index (never reparses,
 * never calls a model) and groups callers per changed symbol.
 */
export class BlastService {
  constructor(
    private readonly container: Container,
    private readonly reviews: ReviewRepository = new ReviewRepository(container.db),
  ) {}

  async get(
    workspaceId: string,
    prId: string,
    logger: Pick<PinoLike, 'info' | 'warn'>,
  ): Promise<PrBlastResponse> {
    const started = Date.now();
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    let files = (await this.reviews.getPrFiles(prId)).map((f) => f.path);
    let source: 'pr_files' | 'git_diff' = 'pr_files';
    if (files.length === 0) {
      source = 'git_diff';
      const repo = await this.reviews.getRepo(pull.repoId);
      if (!repo) throw new NotFoundError('Repository not found');
      try {
        const diff = await this.container.git.diff(
          { owner: repo.owner, name: repo.name },
          pull.base,
          pull.headSha,
        );
        files = diff.files.map((f) => f.path);
      } catch (err) {
        logger.warn({ pr_id: prId, err: (err as Error).message }, 'blast.diff_failed');
        files = [];
      }
    }

    const state = await this.container.repoIntel.getIndexState(pull.repoId);
    // With no changed files the facade still answers (flag_off surfaces); otherwise an empty
    // file list means we could not tell what changed, which is not an authoritative empty map.
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, files, { fallback: false });
    const status =
      files.length === 0 && !result.degraded
        ? { degraded: true, reason: 'no_data' as const }
        : blastStatus(result, state);
    const resp = toPrBlastResponse(result, {
      ...status,
      indexSha: state.lastIndexedSha || null,
      maxCallers: MAX_CALLERS_PER_SYMBOL,
    });

    logger.info(
      {
        pr_id: prId,
        repo_id: pull.repoId,
        source: 'repo_intel_index',
        index_status: state.status,
        index_sha: resp.index_sha,
        degraded: resp.degraded,
        reason: resp.reason,
        changed_files: files.length,
        changed_files_source: source,
        ...resp.counts,
        ms: Date.now() - started,
      },
      'blast.read',
    );
    return resp;
  }
}
