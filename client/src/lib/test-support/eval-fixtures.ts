/* Test fixtures for the Evals tab and the Eval Dashboard (not shipped to the UI). */
import type { EvalCase, EvalCaseResult, EvalRunDetail, EvalRunSummary } from "@devdigest/shared";

export const COUNTS: NonNullable<EvalRunSummary["counts"]> = {
  cases_total: 8,
  cases_scored: 8,
  cases_passed: 6,
  cases_failed: 2,
  cases_error: 0,
  must_find_total: 6,
  must_not_flag_total: 2,
  tp: 5,
  fn: 1,
  forbidden_hits: 1,
  unlabelled: 3,
  emitted: 9,
  grounded: 9,
  dropped: 1,
};

export function makeRun(over: Partial<EvalRunSummary> = {}): EvalRunSummary {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    status: "done",
    started_at: "2026-10-01T10:00:00.000Z",
    finished_at: "2026-10-01T10:01:00.000Z",
    progress: { done: 8, total: 8 },
    config: {
      agent_version: 1,
      config_id: "cfg1",
      provider: "openrouter",
      model: "m1",
      system_prompt: "You are a reviewer.",
      strategy: "single-pass",
      skills: [],
    },
    case_ids: ["c1"],
    metrics: {
      recall: 0.66,
      precision: 0.8,
      strict_precision: 0.55,
      citation_accuracy: 0.9,
      macro_recall: 0.6,
      macro_precision: 0.7,
    },
    counts: COUNTS,
    cost_usd: 0.05,
    duration_ms: 60000,
    error: null,
    ...over,
  };
}

export function makeCase(over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "hardcoded-stripe-key",
    expectation: { kind: "must_find", file: "src/config.ts", start_line: 11, end_line: 13 },
    display: { title: "Hardcoded Stripe secret key", severity: "CRITICAL", category: "security" },
    input_diff: "diff --git a/src/config.ts b/src/config.ts\n",
    source: { finding_id: "f1", pr_number: 7, repo: "acme/api" },
    created_at: "2026-10-01T09:00:00.000Z",
    last_result: null,
    ...over,
  };
}

export function makeResult(over: Partial<EvalCaseResult> = {}): EvalCaseResult {
  return {
    case_id: "c1",
    case_name: "hardcoded-stripe-key",
    expectation: { kind: "must_find", file: "src/config.ts", start_line: 11, end_line: 13 },
    status: "pass",
    findings: [],
    grounded: 1,
    dropped: 0,
    summary: "expected 1 finding, got 1",
    cost_usd: 0.01,
    duration_ms: 1000,
    error: null,
    ...over,
  };
}

export function makeDetail(over: Partial<EvalRunDetail> = {}): EvalRunDetail {
  return { ...makeRun(), results: [makeResult()], ...over };
}
