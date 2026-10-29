import { z } from 'zod';
import { Verdict, Finding, Severity, FindingCategory } from './findings.js';
import {
  EvalRun,
  EvalOwnerKind,
  EvalCase,
  EvalExpectation,
  EvalCaseStatus,
  Conformance,
  Provider,
  ReviewStrategy,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ---- Eval pipeline (agent eval cases + runs) ----

/** Response of `POST /findings/:id/eval-case` (201 created, 200 already existed). */
export const CreateEvalCaseResponse = z.object({
  case: EvalCase,
  created: z.boolean(),
});
export type CreateEvalCaseResponse = z.infer<typeof CreateEvalCaseResponse>;

export const EvalRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/** Agent config captured once at run start; `config_id` is equal iff every other field is. */
export const EvalConfigSnapshot = z.object({
  agent_version: z.number().int(),
  config_id: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  strategy: ReviewStrategy,
  skills: z.array(
    z.object({ skill_id: z.string(), name: z.string(), version: z.number().int() }),
  ),
});
export type EvalConfigSnapshot = z.infer<typeof EvalConfigSnapshot>;

const Ratio = z.number().min(0).max(1).nullable();

export const EvalMetrics = z.object({
  recall: Ratio,
  precision: Ratio,
  strict_precision: Ratio,
  citation_accuracy: Ratio,
  macro_recall: Ratio,
  macro_precision: Ratio,
});
export type EvalMetrics = z.infer<typeof EvalMetrics>;

const Count = z.number().int().min(0);

export const EvalCounts = z.object({
  cases_total: Count,
  cases_scored: Count,
  cases_passed: Count,
  cases_failed: Count,
  cases_error: Count,
  must_find_total: Count,
  must_not_flag_total: Count,
  tp: Count,
  fn: Count,
  forbidden_hits: Count,
  unlabelled: Count,
  emitted: Count,
  grounded: Count,
  dropped: Count,
});
export type EvalCounts = z.infer<typeof EvalCounts>;

export const EvalRunSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: EvalRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  config: EvalConfigSnapshot,
  case_ids: z.array(z.string()),
  metrics: EvalMetrics.nullable(),
  counts: EvalCounts.nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;

export const EvalFindingLabel = z.enum(['tp', 'forbidden', 'unlabelled']);
export type EvalFindingLabel = z.infer<typeof EvalFindingLabel>;

export const EvalCaseResult = z.object({
  /** null once the case is deleted (FK set null); `case_name` keeps the run-time name. */
  case_id: z.string().nullable(),
  case_name: z.string(),
  expectation: EvalExpectation,
  status: EvalCaseStatus,
  findings: z.array(
    z.object({
      file: z.string(),
      start_line: z.number().int(),
      end_line: z.number().int(),
      severity: Severity,
      category: FindingCategory,
      title: z.string(),
      label: EvalFindingLabel,
    }),
  ),
  grounded: z.number().int(),
  dropped: z.number().int(),
  summary: z.string(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalRunDetail = EvalRunSummary.extend({
  results: z.array(EvalCaseResult),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

export const EvalDashboardOverview = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      name: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      cases_total: z.number().int(),
      last_run: EvalRunSummary.nullable(),
    }),
  ),
  recent_runs: z.array(EvalRunSummary),
});
export type EvalDashboardOverview = z.infer<typeof EvalDashboardOverview>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Where the CI runner posts its review. Shared by the export input and the manifest. */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`modules/ci/helpers.ts`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
  post_as: CiPostAs.default('github_review'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Result of `POST /ci-runs/refresh`. */
export const CiRefreshResult = z.object({
  ingested: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
// The artifact is untrusted input and lands in int4 columns — bound every integer.
const Int4 = z.number().int().min(0).max(2_147_483_647);

export const CiResultArtifact = z.object({
  findings_count: Int4,
  critical: Int4.nullish(),
  warning: Int4.nullish(),
  suggestion: Int4.nullish(),
  cost_usd: z.number().min(0).nullable(),
  duration_ms: Int4.nullish(),
  agent: z.string().min(1).max(200),
  version: z.string().nullish(),
  pr_number: Int4.nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
