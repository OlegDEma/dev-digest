import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    // Pre-staged for skill-owned cases (NG6); unused by agent cases.
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    sourcePrNumber: integer('source_pr_number'),
    sourceRepo: text('source_repo'),
    expectationKind: text('expectation_kind', { enum: ['must_find', 'must_not_flag'] }),
    expectationFile: text('expectation_file'),
    expectationStartLine: integer('expectation_start_line'),
    expectationEndLine: integer('expectation_end_line'),
    displayTitle: text('display_title'),
    displaySeverity: text('display_severity'),
    displayCategory: text('display_category'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('eval_cases_source_finding').on(t.sourceFindingId),
    uniqueIndex('eval_cases_owner_name').on(t.ownerKind, t.ownerId, t.name),
    index('eval_cases_ws_agent').on(t.workspaceId, t.agentId),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    progressDone: integer('progress_done').notNull().default(0),
    progressTotal: integer('progress_total').notNull(),
    config: jsonb('config').notNull(),
    caseIds: jsonb('case_ids').notNull(),
    counts: jsonb('counts'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    strictPrecision: doublePrecision('strict_precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    macroRecall: doublePrecision('macro_recall'),
    macroPrecision: doublePrecision('macro_precision'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('eval_runs_one_running_per_agent')
      .on(t.agentId)
      .where(sql`status = 'running'`),
    index('eval_runs_agent_started').on(t.agentId, t.startedAt),
    index('eval_runs_ws_started').on(t.workspaceId, t.startedAt),
  ],
);

export const evalCaseResults = pgTable(
  'eval_case_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'set null' }),
    position: integer('position').notNull(),
    caseName: text('case_name').notNull(),
    expectation: jsonb('expectation').notNull(),
    status: text('status', { enum: ['pass', 'fail', 'error'] }).notNull(),
    findings: jsonb('findings').notNull().default(sql`'[]'::jsonb`),
    grounded: integer('grounded').notNull().default(0),
    dropped: integer('dropped').notNull().default(0),
    summary: text('summary').notNull(),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    finishedAt: timestamp('finished_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('eval_case_results_run').on(t.runId),
    index('eval_case_results_case').on(t.caseId, t.finishedAt),
  ],
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
