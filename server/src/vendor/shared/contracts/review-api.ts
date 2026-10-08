import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { Intent, IntentSource, SmartDiff } from './brief.js';
import { RunSummary } from './trace.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** Intent persisted for a PR (the Intent plus the pr_id it scopes). */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  head_sha: z.string().nullable(),
  sources: z.array(IntentSource),
  model: z.string().nullable(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  diff_tokens_saved: z.number().int(),
  computed_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

export const PrIntentResponse = z.object({ intent: PrIntentRecord.nullable(), stale: z.boolean() });
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** `GET /runs/:id` — one run's status + the PR it ran on + the review it produced
 *  (null while running, or when the run failed/was cancelled before persisting). */
export const RunDetail = RunSummary.extend({
  pr_id: z.string().nullable(),
  review: ReviewRecord.nullable(),
});
export type RunDetail = z.infer<typeof RunDetail>;

/** `GET /pulls/:id/runs/active` — one in-flight run (status='running').
 *  Mirrors the repository return type at server/src/modules/reviews/repository/run.repo.ts:14. */
export const ActiveRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type ActiveRun = z.infer<typeof ActiveRun>;
