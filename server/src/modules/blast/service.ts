import type { PrBlastResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { ReviewRepository } from '../reviews/repository.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import type { BlastResult } from '../repo-intel/types.js';
import { blastStatus, toPrBlastResponse } from './helpers.js';

const EMPTY_RESULT: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };

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
      } catch {
        files = [];
      }
    }

    const state = await this.container.repoIntel.getIndexState(pull.repoId);
    const result =
      files.length > 0
        ? await this.container.repoIntel.getBlastRadius(pull.repoId, files, { fallback: false })
        : EMPTY_RESULT;
    const status = blastStatus(result, state);
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
