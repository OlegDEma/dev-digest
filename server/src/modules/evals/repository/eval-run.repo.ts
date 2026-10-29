import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalConfigSnapshot, EvalCounts, EvalMetrics } from '@devdigest/shared';
import type { EvalCaseResultRow, EvalRunRow } from './types.js';
import { EVAL_RESTART_ERROR } from '../constants.js';

/** Eval-run data access (runs + per-case results). Workspace-scoped reads. */

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export interface NewRun {
  workspaceId: string;
  agentId: string;
  agentName: string;
  config: EvalConfigSnapshot;
  caseIds: string[];
}

/**
 * Insert the `running` row first (the durable half of the fire-and-forget
 * trio). The partial unique index "one running row per agent" turns a
 * concurrent second start into `{ conflict }`.
 */
export async function insertRunningRun(
  db: Db,
  v: NewRun,
): Promise<{ run: EvalRunRow } | { conflict: string | null }> {
  try {
    const [run] = await db
      .insert(t.evalRuns)
      .values({
        workspaceId: v.workspaceId,
        agentId: v.agentId,
        agentName: v.agentName,
        status: 'running',
        progressTotal: v.caseIds.length,
        config: v.config,
        caseIds: v.caseIds,
      })
      .returning();
    return { run: run! };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const running = await findRunningRun(db, v.agentId);
    return { conflict: running?.id ?? null };
  }
}

export function findRunningRun(db: Db, agentId: string): Promise<EvalRunRow | undefined> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.agentId, agentId), eq(t.evalRuns.status, 'running')))
    .then((r) => r[0]);
}

export interface NewCaseResult {
  runId: string;
  caseId: string;
  position: number;
  caseName: string;
  expectation: unknown;
  status: 'pass' | 'fail' | 'error';
  findings: unknown[];
  grounded: number;
  dropped: number;
  summary: string;
  costUsd: number | null;
  durationMs: number | null;
  error: string | null;
}

/** Insert a result row and bump the run's progress in one statement pair. */
export async function insertCaseResult(db: Db, v: NewCaseResult): Promise<void> {
  await db.transaction(async (tx) => {
    // A case deleted mid-run (AC-19) must not break the FK: resolve to NULL then.
    await tx.insert(t.evalCaseResults).values({
      ...v,
      caseId: sql`(select ${t.evalCases.id} from ${t.evalCases} where ${t.evalCases.id} = ${v.caseId})`,
    });
    await tx
      .update(t.evalRuns)
      .set({ progressDone: sql`${t.evalRuns.progressDone} + 1` })
      .where(eq(t.evalRuns.id, v.runId));
  });
}

export async function finishRun(
  db: Db,
  id: string,
  v: {
    status: 'done' | 'partial' | 'failed';
    metrics: EvalMetrics | null;
    counts: EvalCounts;
    costUsd: number | null;
    durationMs: number;
    error: string | null;
  },
): Promise<void> {
  await db
    .update(t.evalRuns)
    .set({
      status: v.status,
      finishedAt: new Date(),
      recall: v.metrics?.recall ?? null,
      precision: v.metrics?.precision ?? null,
      strictPrecision: v.metrics?.strict_precision ?? null,
      citationAccuracy: v.metrics?.citation_accuracy ?? null,
      macroRecall: v.metrics?.macro_recall ?? null,
      macroPrecision: v.metrics?.macro_precision ?? null,
      counts: v.counts,
      costUsd: v.costUsd,
      durationMs: v.durationMs,
      error: v.error,
    })
    .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'running')));
}

export async function failRun(db: Db, id: string, message: string): Promise<void> {
  await db
    .update(t.evalRuns)
    .set({ status: 'failed', error: message, finishedAt: new Date() })
    .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'running')));
}

/** Boot reaper: every `running` row is orphaned (single API instance). */
export async function reapRunning(db: Db): Promise<number> {
  const rows = await db
    .update(t.evalRuns)
    .set({ status: 'failed', error: EVAL_RESTART_ERROR, finishedAt: sql`now()` })
    .where(eq(t.evalRuns.status, 'running'))
    .returning({ id: t.evalRuns.id });
  return rows.length;
}

export function listForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
  limit: number,
): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId)))
    .orderBy(desc(t.evalRuns.startedAt), desc(t.evalRuns.id))
    .limit(limit);
}

export async function getRunWithResults(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<{ run: EvalRunRow; results: EvalCaseResultRow[] } | undefined> {
  const [run] = await db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.id, id)));
  if (!run) return undefined;
  const results = await db
    .select()
    .from(t.evalCaseResults)
    .where(eq(t.evalCaseResults.runId, id))
    .orderBy(asc(t.evalCaseResults.position));
  return { run, results };
}

export function recentForWorkspace(db: Db, workspaceId: string, limit: number): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(eq(t.evalRuns.workspaceId, workspaceId))
    .orderBy(desc(t.evalRuns.startedAt), desc(t.evalRuns.id))
    .limit(limit);
}

/** Newest finished (`done`/`partial`) run per agent. */
export function latestFinishedPerAgent(db: Db, workspaceId: string): Promise<EvalRunRow[]> {
  return db
    .selectDistinctOn([t.evalRuns.agentId])
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), inArray(t.evalRuns.status, ['done', 'partial'])))
    .orderBy(t.evalRuns.agentId, desc(t.evalRuns.startedAt))
    .then((rows) => rows);
}
