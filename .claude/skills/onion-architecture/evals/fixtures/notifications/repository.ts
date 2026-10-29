import type { Db } from '../db/client.js';
import * as rules from './repository/rule.repo.js';
import * as reviews from './repository/review.repo.js';

export type { InsertNotificationRule, NotificationRuleRow } from './repository/rule.repo.js';
export type { ReviewForNotification } from './repository/review.repo.js';

export class NotificationRepository {
  constructor(private db: Db) {}

  findRepo(workspaceId: string, repoId: string) {
    return rules.findRepo(this.db, workspaceId, repoId);
  }

  insertRule(input: rules.InsertNotificationRule) {
    return rules.insertRule(this.db, input);
  }

  deleteRule(workspaceId: string, ruleId: string) {
    return rules.deleteRule(this.db, workspaceId, ruleId);
  }

  enabledRulesForRepo(workspaceId: string, repoId: string) {
    return rules.enabledRulesForRepo(this.db, workspaceId, repoId);
  }

  reviewForNotification(workspaceId: string, reviewId: string) {
    return reviews.reviewForNotification(this.db, workspaceId, reviewId);
  }
}
