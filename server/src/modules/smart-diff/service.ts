import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { currentReviewFindings } from '../reviews/helpers.js';
import { buildSmartDiff, findingLinesByPath } from './helpers.js';

/**
 * Role-grouped file list for a PR, with the lines that carry current findings.
 * Read-only; owns no table; makes no model or GitHub call.
 */
export class SmartDiffService {
  constructor(
    container: Container,
    private readonly reviews: ReviewRepository = new ReviewRepository(container.db),
  ) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.reviews.getPrFiles(prId);
    const rows = await this.reviews.reviewsForPull(prId);
    const lines = findingLinesByPath(currentReviewFindings(rows));
    return buildSmartDiff(files, lines);
  }
}
