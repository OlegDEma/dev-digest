import { and, eq } from 'drizzle-orm';
import type { Severity } from '../../contracts/findings.js';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type NotificationRuleRow = typeof t.notificationRules.$inferSelect;

export interface InsertNotificationRule {
  workspaceId: string;
  repoId: string;
  createdBy: string;
  minSeverity: Severity;
  enabled: boolean;
}

export async function findRepo(db: Db, workspaceId: string, repoId: string) {
  const [row] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
  return row;
}

export async function insertRule(db: Db, input: InsertNotificationRule): Promise<NotificationRuleRow> {
  const [row] = await db.insert(t.notificationRules).values(input).returning();
  return row!;
}

export async function deleteRule(db: Db, workspaceId: string, ruleId: string): Promise<boolean> {
  const rows = await db
    .delete(t.notificationRules)
    .where(and(eq(t.notificationRules.workspaceId, workspaceId), eq(t.notificationRules.id, ruleId)))
    .returning({ id: t.notificationRules.id });
  return rows.length > 0;
}

export async function enabledRulesForRepo(
  db: Db,
  workspaceId: string,
  repoId: string,
): Promise<NotificationRuleRow[]> {
  return db
    .select()
    .from(t.notificationRules)
    .where(
      and(
        eq(t.notificationRules.workspaceId, workspaceId),
        eq(t.notificationRules.repoId, repoId),
        eq(t.notificationRules.enabled, true),
      ),
    );
}
