import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const IntentRiskKind = z.enum(['auth', 'dependency', 'performance', 'data', 'security', 'api', 'other']);
export type IntentRiskKind = z.infer<typeof IntentRiskKind>;
export const IntentRiskArea = z.object({ label: z.string(), kind: IntentRiskKind });
export type IntentRiskArea = z.infer<typeof IntentRiskArea>;
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;
// Field order = generation order; judgement (confidence) last. Every field is
// required: strict json_schema rejects optional properties.
export const Intent = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(IntentRiskArea),
  missing_context: z.array(z.string()),
  confidence: IntentConfidence,
});
export type Intent = z.infer<typeof Intent>;

export const IntentSourceKind = z.enum(['pr_title', 'pr_body', 'issue', 'repo_doc', 'url', 'file_list']);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;
export const IntentSourceStatus = z.enum(['used', 'unresolved', 'skipped']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  reason: z.string().nullable(),
  tokens: z.number().int(),
});
export type IntentSource = z.infer<typeof IntentSource>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Blast radius: PR route response (spec 12) ----
// Lowercase snake_case values; mirrors repo-intel's DegradedReason (server/src/modules/repo-intel/types.ts:26).
export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastCounts = z.object({
  symbols: z.number().int(),
  callers: z.number().int(),
  endpoints: z.number().int(),
  crons: z.number().int(),
});
export type BlastCounts = z.infer<typeof BlastCounts>;

export const BlastFileFacts = z.object({
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastFileFacts = z.infer<typeof BlastFileFacts>;

/** GET /pulls/:id/blast. A superset of BlastRadius, so it still parses as one. */
export const PrBlastResponse = BlastRadius.extend({
  /** Same as BlastRadius.downstream, plus whether the caller list was cut by the per-symbol cap. */
  downstream: z.array(DownstreamImpact.extend({ truncated: z.boolean() })),
  counts: BlastCounts,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(),
  /** Commit the index was built at; caller lines refer to it. */
  index_sha: z.string().nullable(),
  /** MAX_CALLERS_PER_SYMBOL, so clients never hard-code the cap. */
  max_callers_per_symbol: z.number().int(),
  /** Each caller file's own endpoints/crons (only files present in downstream callers). */
  facts_by_file: z.record(z.string(), BlastFileFacts),
});
export type PrBlastResponse = z.infer<typeof PrBlastResponse>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- PR history: route response (spec 12 rev 4) ----
export const PrHistoryUnavailableReason = z.enum(['no_token', 'github_error']);
export type PrHistoryUnavailableReason = z.infer<typeof PrHistoryUnavailableReason>;

/** GET /pulls/:id/history. A superset of PrHistory; `available:false` when GitHub cannot be asked. */
export const PrHistoryResponse = PrHistory.extend({
  available: z.boolean(),
  reason: PrHistoryUnavailableReason.nullable(),
});
export type PrHistoryResponse = z.infer<typeof PrHistoryResponse>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
