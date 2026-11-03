import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type AgentRunRow = typeof t.agentRuns.$inferSelect;

export async function listRunsForPull(db: Db, workspaceId: string, prId: string): Promise<AgentRunRow[]> {
  return db
    .select()
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.createdAt));
}

export async function getRunForWorkspace(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<AgentRunRow | undefined> {
  const [row] = await db
    .select()
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.id, runId)));
  return row;
}

export async function createAgentRun(
  db: Db,
  input: { workspaceId: string; prId: string },
): Promise<AgentRunRow> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({ workspaceId: input.workspaceId, prId: input.prId, status: 'running' })
    .returning();
  return row!;
}

export async function completeAgentRun(db: Db, runId: string, costUsd: number): Promise<void> {
  await db.update(t.agentRuns).set({ status: 'done', costUsd }).where(eq(t.agentRuns.id, runId));
}

export async function failAgentRun(db: Db, runId: string, error: string): Promise<void> {
  await db.update(t.agentRuns).set({ status: 'failed', error }).where(eq(t.agentRuns.id, runId));
}

export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed', error: 'reaped on boot' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}
