import { Octokit } from 'octokit';
import type { NotificationRule, NotificationRuleInput } from '../contracts/notifications.js';
import type { Severity } from '../contracts/findings.js';
import type { Container } from '../platform/container.js';
import { NotFoundError } from '../platform/errors.js';
import { NotificationRepository } from './repository.js';

const SEVERITY_RANK: Record<Severity, number> = {
  SUGGESTION: 0,
  WARNING: 1,
  CRITICAL: 2,
};

export class NotificationService {
  private repo: NotificationRepository;
  private octokit: Octokit;

  constructor(private container: Container) {
    this.repo = new NotificationRepository(container.db);
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }

  async createRule(
    workspaceId: string,
    userId: string,
    repoId: string,
    input: NotificationRuleInput,
  ): Promise<NotificationRule> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError(`repo ${repoId} not found`);
    const row = await this.repo.insertRule({
      workspaceId,
      repoId,
      createdBy: userId,
      minSeverity: input.min_severity,
      enabled: input.enabled ?? true,
    });
    return {
      id: row.id,
      repo_id: row.repoId,
      min_severity: row.minSeverity as Severity,
      enabled: row.enabled,
      created_at: row.createdAt.toISOString(),
    };
  }

  async deleteRule(workspaceId: string, ruleId: string): Promise<void> {
    const deleted = await this.repo.deleteRule(workspaceId, ruleId);
    if (!deleted) throw new NotFoundError(`rule ${ruleId} not found`);
  }

  async notifyForReview(workspaceId: string, reviewId: string): Promise<number> {
    const review = await this.repo.reviewForNotification(workspaceId, reviewId);
    if (!review) return 0;
    const rules = await this.repo.enabledRulesForRepo(workspaceId, review.repoId);
    let posted = 0;
    for (const rule of rules) {
      const threshold = SEVERITY_RANK[rule.minSeverity as Severity];
      const hits = review.findings.filter((f) => SEVERITY_RANK[f.severity] >= threshold);
      if (hits.length === 0) continue;
      try {
        await this.octokit.rest.issues.createComment({
          owner: review.owner,
          repo: review.repoName,
          issue_number: review.prNumber,
          body: `DevDigest found ${hits.length} finding(s) at ${rule.minSeverity} or above.`,
        });
        posted += 1;
      } catch {
        setTimeout(() => {
          void this.notifyForReview(workspaceId, reviewId).catch(() => {});
        }, 60_000);
        return posted;
      }
    }
    return posted;
  }
}
