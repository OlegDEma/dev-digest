import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
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
  scope: 'all' | 'case';
}

const ACTIVE = ['running', 'queued'] as const;
const FINISHED = ['done', 'partial'] as const;

/**
 * Insert the `running` row first (the durable half of the fire-and-forget
 * trio). The partial unique index "one running/queued row per agent" turns a
 * concurrent second start into `{ conflict }`.
 */
export async function insertRunningRun(
  db: Db,
  v: NewRun,
): Promise<{ run: EvalRunRow } | { conflict: string | null }> {
  try {
    const [run] = await db.insert(t.evalRuns).values(runValues(v, 'running')).returning();
    return { run: run! };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const active = await findActiveRun(db, v.agentId);
    return { conflict: active?.id ?? null };
  }
}

function runValues(v: NewRun, status: 'running' | 'queued') {
  return {
    workspaceId: v.workspaceId,
    agentId: v.agentId,
    agentName: v.agentName,
    status,
    scope: v.scope,
    progressTotal: v.caseIds.length,
    config: v.config,
    caseIds: v.caseIds,
  };
}

export interface BatchRunRow extends NewRun {
  status: 'running' | 'queued';
}

/**
 * Insert a whole batch in one transaction, one savepoint per row: a concurrent
 * unique-index conflict (another run took the agent) becomes a `conflicts`
 * entry instead of aborting the batch; any other failure rolls everything back
 * (AC-D78b).
 */
export function insertBatchRuns(
  db: Db,
  rows: BatchRunRow[],
): Promise<{ created: EvalRunRow[]; conflicts: string[] }> {
  return db.transaction(async (tx) => {
    const created: EvalRunRow[] = [];
    const conflicts: string[] = [];
    for (const v of rows) {
      try {
        const run = await tx.transaction(async (sp) => {
          const [r] = await sp.insert(t.evalRuns).values(runValues(v, v.status)).returning();
          return r!;
        });
        created.push(run);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        conflicts.push(v.agentId);
      }
    }
    return { created, conflicts };
  });
}

/** `queued` → `running` when the batch queue gives the run a slot. False when it is no longer queued. */
export async function markRunning(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(t.evalRuns)
    .set({ status: 'running' })
    .where(and(eq(t.evalRuns.id, id), eq(t.evalRuns.status, 'queued')))
    .returning({ id: t.evalRuns.id });
  return rows.length > 0;
}

/** A queued batch run reads its cases late: shrink the total to the cases that still exist. */
export async function setProgressTotal(db: Db, id: string, total: number): Promise<void> {
  await db.update(t.evalRuns).set({ progressTotal: total }).where(eq(t.evalRuns.id, id));
}

/** The agent's `running` or `queued` run, if any. */
export function findActiveRun(db: Db, agentId: string): Promise<EvalRunRow | undefined> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.agentId, agentId), inArray(t.evalRuns.status, [...ACTIVE])))
    .then((r) => r[0]);
}

/** Agents of the workspace that currently have a `running` or `queued` run. */
export async function activeAgentIds(db: Db, workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ agentId: t.evalRuns.agentId })
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), inArray(t.evalRuns.status, [...ACTIVE])));
  return new Set(rows.map((r) => r.agentId));
}

export function getRun(db: Db, workspaceId: string, id: string): Promise<EvalRunRow | undefined> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.id, id)))
    .then((r) => r[0]);
}

export interface NewCaseResult {
  runId: string;
  caseId: string;
  position: number;
  caseName: string;
  expectation: unknown;
  caseRevision: number;
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
    .where(and(eq(t.evalRuns.id, id), inArray(t.evalRuns.status, [...ACTIVE])));
}

/** Boot reaper: every `running` or `queued` row is orphaned (single API instance). */
export async function reapRunning(db: Db): Promise<number> {
  const rows = await db
    .update(t.evalRuns)
    .set({ status: 'failed', error: EVAL_RESTART_ERROR, finishedAt: sql`now()` })
    .where(inArray(t.evalRuns.status, [...ACTIVE]))
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

/** Full-set (`scope='all'`) finished runs of the workspace, newest first. */
export function recentFullForWorkspace(db: Db, workspaceId: string, limit: number): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.scope, 'all'), inArray(t.evalRuns.status, [...FINISHED])))
    .orderBy(desc(t.evalRuns.startedAt), desc(t.evalRuns.id))
    .limit(limit);
}

/** Newest finished full-set run per agent. */
export function latestFinishedFullPerAgent(db: Db, workspaceId: string): Promise<EvalRunRow[]> {
  return db
    .selectDistinctOn([t.evalRuns.agentId])
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.scope, 'all'), inArray(t.evalRuns.status, [...FINISHED])))
    .orderBy(t.evalRuns.agentId, desc(t.evalRuns.startedAt), desc(t.evalRuns.id));
}

/** The agent's newest two finished full-set runs (latest first), any time. */
export function latestTwoFinishedFull(db: Db, workspaceId: string, agentId: string): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(
      and(
        eq(t.evalRuns.workspaceId, workspaceId),
        eq(t.evalRuns.agentId, agentId),
        eq(t.evalRuns.scope, 'all'),
        inArray(t.evalRuns.status, [...FINISHED]),
      ),
    )
    .orderBy(desc(t.evalRuns.startedAt), desc(t.evalRuns.id))
    .limit(2);
}

/** Finished full-set runs started since `since`, oldest first. */
export function finishedFullRuns(db: Db, workspaceId: string, agentId: string, since: Date): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(
      and(
        eq(t.evalRuns.workspaceId, workspaceId),
        eq(t.evalRuns.agentId, agentId),
        eq(t.evalRuns.scope, 'all'),
        inArray(t.evalRuns.status, [...FINISHED]),
        gte(t.evalRuns.startedAt, since),
      ),
    )
    .orderBy(asc(t.evalRuns.startedAt), asc(t.evalRuns.id));
}

/** Runs of any scope started since `since`, newest first. */
export function listForAgentSince(
  db: Db,
  workspaceId: string,
  agentId: string,
  since: Date,
  limit: number,
): Promise<EvalRunRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId), gte(t.evalRuns.startedAt, since)))
    .orderBy(desc(t.evalRuns.startedAt), desc(t.evalRuns.id))
    .limit(limit);
}

/**
 * agent_id → recall of its last `points` finished full-set runs, oldest to
 * newest; runs without a recall are omitted.
 */
export async function sparklinesByAgent(
  db: Db,
  workspaceId: string,
  points: number,
): Promise<Map<string, number[]>> {
  const ranked = db
    .select({
      agentId: t.evalRuns.agentId,
      recall: t.evalRuns.recall,
      startedAt: t.evalRuns.startedAt,
      rn: sql<number>`row_number() over (partition by ${t.evalRuns.agentId} order by ${t.evalRuns.startedAt} desc, ${t.evalRuns.id} desc)`.as('rn'),
    })
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.scope, 'all'), inArray(t.evalRuns.status, [...FINISHED])))
    .as('ranked');
  const rows = await db
    .select({ agentId: ranked.agentId, recall: ranked.recall })
    .from(ranked)
    .where(lte(ranked.rn, points))
    .orderBy(ranked.agentId, asc(ranked.startedAt));
  const out = new Map<string, number[]>();
  for (const r of rows) {
    if (r.recall == null) continue;
    const list = out.get(r.agentId) ?? [];
    list.push(r.recall);
    out.set(r.agentId, list);
  }
  return out;
}
