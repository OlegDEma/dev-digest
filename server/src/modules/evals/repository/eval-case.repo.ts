import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EvalCaseInputFile, EvalExpectedItem, EvalPrMeta } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalCaseRow } from './types.js';

const c0 = t.evalCases;
import type { LastResult } from '../helpers.js';

/**
 * Eval-case data access — the only evals file (with eval-run.repo.ts) that
 * touches the DB. Every read/write is workspace-scoped.
 */

export interface NewEvalCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  sourceFindingId: string;
  sourcePrNumber: number;
  sourceRepo: string;
  expectationKind: 'must_find' | 'must_not_flag';
  expectationFile: string;
  expectationStartLine: number;
  expectationEndLine: number;
  displayTitle: string;
  displaySeverity: string;
  displayCategory: string;
  expectedOutput: EvalExpectedItem[];
  inputFiles: EvalCaseInputFile[];
  inputMeta: EvalPrMeta;
}

export function findBySourceFinding(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<EvalCaseRow | undefined> {
  return db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)))
    .then((r) => r[0]);
}

export async function namesForAgent(db: Db, workspaceId: string, agentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ name: t.evalCases.name })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)));
  return new Set(rows.map((r) => r.name));
}

/**
 * Insert a case. A unique violation on `source_finding_id` (concurrent double
 * click) returns the existing row with `created: false`.
 */
export async function insertCase(
  db: Db,
  values: NewEvalCase,
): Promise<{ row: EvalCaseRow; created: boolean } | { nameTaken: true }> {
  let row: EvalCaseRow | undefined;
  try {
    [row] = await db
      .insert(t.evalCases)
      .values({ ...values, ownerKind: 'agent', ownerId: values.agentId })
      .onConflictDoNothing({ target: t.evalCases.sourceFindingId })
      .returning();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    // The only other unique index is (owner_kind, owner_id, name): a concurrent
    // creation took the name between our read and this insert.
    if (e?.code === '23505' || e?.cause?.code === '23505') return { nameTaken: true };
    throw err;
  }
  if (row) return { row, created: true };
  const existing = await findBySourceFinding(db, values.workspaceId, values.sourceFindingId);
  if (!existing) throw new Error('eval case insert conflicted but no row exists');
  return { row: existing, created: false };
}

function uniqueViolation(err: unknown): { constraint: string | undefined } | null {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  if (e?.code !== '23505' && e?.cause?.code !== '23505') return null;
  return { constraint: e.constraint_name ?? e.cause?.constraint_name };
}

export async function getCase(db: Db, workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id), eq(t.evalCases.ownerKind, 'agent')));
  return row;
}

export interface ManualCaseValues {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputFiles: EvalCaseInputFile[];
  inputMeta: EvalPrMeta;
  expectedOutput: EvalExpectedItem[];
  sourceFindingId?: string;
  sourcePrNumber?: number;
  sourceRepo?: string;
  displayTitle?: string;
  displaySeverity?: string;
  displayCategory?: string;
}

/** Insert an editor-authored case (revision 1). Unique violations come back as a flag, never a throw. */
export async function insertManualCase(
  db: Db,
  values: ManualCaseValues,
): Promise<{ row: EvalCaseRow } | { nameTaken: true } | { findingTaken: true }> {
  try {
    const [row] = await db
      .insert(t.evalCases)
      .values({ ...values, ownerKind: 'agent', ownerId: values.agentId, revision: 1 })
      .returning();
    return { row: row! };
  } catch (err) {
    const u = uniqueViolation(err);
    if (!u) throw err;
    return u.constraint === 'eval_cases_source_finding' ? { findingTaken: true } : { nameTaken: true };
  }
}

export interface CaseContentValues {
  name: string;
  inputDiff: string;
  inputFiles: EvalCaseInputFile[];
  inputMeta: EvalPrMeta;
  expectedOutput: EvalExpectedItem[];
}

/**
 * Update a case in ONE statement (a failed save leaves the row untouched).
 * `revision` goes up by 1 when the run-relevant content (diff, Files, PR meta,
 * expected list) differs from what is stored AT UPDATE TIME - decided in SQL, so
 * concurrent saves each bump correctly. A legacy row (NULL `expected_output`)
 * cannot be compared column-wise; for it `legacyContentChanged`, computed by the
 * caller against the legacy mapping, decides.
 */
export async function updateCase(
  db: Db,
  workspaceId: string,
  id: string,
  values: CaseContentValues,
  legacyContentChanged: boolean,
): Promise<{ row: EvalCaseRow } | { nameTaken: true } | undefined> {
  const c = t.evalCases;
  const files = JSON.stringify(values.inputFiles);
  const meta = JSON.stringify(values.inputMeta);
  const expected = JSON.stringify(values.expectedOutput);
  const revision = sql`CASE
    WHEN ${c.expectedOutput} IS NULL THEN ${c.revision} + ${legacyContentChanged ? 1 : 0}
    WHEN (${c.inputDiff}, ${c.inputFiles}, ${c.inputMeta}, ${c.expectedOutput})
      IS DISTINCT FROM (${values.inputDiff}::text, ${files}::jsonb, ${meta}::jsonb, ${expected}::jsonb)
    THEN ${c.revision} + 1
    ELSE ${c.revision} END`;
  try {
    const [row] = await db
      .update(c)
      .set({ ...values, updatedAt: sql`now()`, revision })
      .where(and(eq(c.workspaceId, workspaceId), eq(c.id, id), eq(c.ownerKind, 'agent')))
      .returning();
    return row ? { row } : undefined;
  } catch (err) {
    if (uniqueViolation(err)) return { nameTaken: true };
    throw err;
  }
}

/** Ids of an agent's cases, oldest first (the order a run reviews them in). */
export async function idsForAgent(db: Db, workspaceId: string, agentId: string): Promise<string[]> {
  const rows = await db
    .select({ id: c0.id })
    .from(c0)
    .where(and(eq(c0.workspaceId, workspaceId), eq(c0.agentId, agentId)))
    .orderBy(asc(c0.createdAt), asc(c0.id));
  return rows.map((r) => r.id);
}

/** Cases of one agent by id, in the order of `ids`; ids that no longer exist are left out. */
export async function listByIds(
  db: Db,
  workspaceId: string,
  agentId: string,
  ids: string[],
): Promise<EvalCaseRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.agentId, agentId),
        inArray(t.evalCases.id, ids),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Latest result of each case in a FINISHED run (`done`/`partial`). */
export async function lastResults(db: Db, caseIds: string[]): Promise<Map<string, LastResult>> {
  const out = new Map<string, LastResult>();
  if (caseIds.length === 0) return out;
  const rows = await db
    .selectDistinctOn([t.evalCaseResults.caseId], {
      caseId: t.evalCaseResults.caseId,
      runId: t.evalCaseResults.runId,
      status: t.evalCaseResults.status,
      ranAt: t.evalCaseResults.finishedAt,
      summary: t.evalCaseResults.summary,
      durationMs: t.evalCaseResults.durationMs,
      costUsd: t.evalCaseResults.costUsd,
      caseRevision: t.evalCaseResults.caseRevision,
    })
    .from(t.evalCaseResults)
    .innerJoin(t.evalRuns, eq(t.evalRuns.id, t.evalCaseResults.runId))
    .where(
      and(inArray(t.evalCaseResults.caseId, caseIds), inArray(t.evalRuns.status, ['done', 'partial'])),
    )
    .orderBy(t.evalCaseResults.caseId, desc(t.evalCaseResults.finishedAt));
  for (const r of rows) {
    if (r.caseId) {
      out.set(r.caseId, {
        runId: r.runId,
        status: r.status,
        ranAt: r.ranAt,
        summary: r.summary,
        durationMs: r.durationMs,
        costUsd: r.costUsd,
        caseRevision: r.caseRevision,
      });
    }
  }
  return out;
}

/** Newest first, with each case's `last_result`. */
export async function listForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<{ row: EvalCaseRow; last: LastResult | null }[]> {
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
    .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
  const last = await lastResults(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => ({ row, last: last.get(row.id) ?? null }));
}

export async function deleteCase(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}

export async function countForAgent(db: Db, workspaceId: string, agentId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)));
  return r?.n ?? 0;
}

/** agent_id → case count, for every agent of the workspace that has cases. */
export async function countsByAgent(db: Db, workspaceId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ agentId: t.evalCases.agentId, n: sql<number>`count(*)::int` })
    .from(t.evalCases)
    .where(eq(t.evalCases.workspaceId, workspaceId))
    .groupBy(t.evalCases.agentId);
  const out = new Map<string, number>();
  for (const r of rows) if (r.agentId) out.set(r.agentId, r.n);
  return out;
}
