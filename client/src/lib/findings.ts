/* findings.ts — pure helpers for grouping/counting review findings.
   Findings link to a run only transitively (finding → review.run_id → run), and
   the list vs the timeline aggregate them differently — these helpers make both
   rules explicit and testable so the displayed numbers always reconcile. */

import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * The three finding severities that carry data, in display order (most severe
 * first). The UI tokens also define INFO, but findings never use it — the
 * contract enum is CRITICAL | WARNING | SUGGESTION.
 */
export const SEVERITY_ORDER = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type FindingSeverity = (typeof SEVERITY_ORDER)[number];

export type SeverityCounts = Record<FindingSeverity, number>;

export function emptySeverityCounts(): SeverityCounts {
  return { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
}

/** Tally findings by severity. Unknown severities are ignored. */
export function severityCounts(findings: FindingRecord[]): SeverityCounts {
  const counts = emptySeverityCounts();
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as FindingSeverity] += 1;
  }
  return counts;
}

/** Sum across the three severities. */
export function totalFindings(counts: SeverityCounts): number {
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}

/** Add findings to `into` keyed by id, skipping dismissed ones and duplicates. */
function pushUnique(into: Map<string, FindingRecord>, findings: FindingRecord[]): void {
  for (const f of findings) {
    if (f.dismissed_at) continue; // dismissed findings don't count or display
    if (!into.has(f.id)) into.set(f.id, f);
  }
}

/**
 * Map each `run_id` → its (non-dismissed, de-duped) findings, for the PR
 * timeline. A finding links to a run only transitively (finding → review.run_id),
 * and one run can produce two review rows (summary + review) sharing a run_id, so
 * union every review that carries the same run_id. Reviews with no run link
 * (CI/summary imports) are skipped — those rows fall back to the count text.
 */
export function findingsByRun(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const acc = new Map<string, Map<string, FindingRecord>>();
  for (const r of reviews) {
    if (!r.run_id) continue;
    let bucket = acc.get(r.run_id);
    if (!bucket) {
      bucket = new Map();
      acc.set(r.run_id, bucket);
    }
    pushUnique(bucket, r.findings);
  }
  const out = new Map<string, FindingRecord[]>();
  for (const [runId, bucket] of acc) out.set(runId, [...bucket.values()]);
  return out;
}

/**
 * The PR's *current* findings for the list: the union of the latest `review` per
 * agent (newest `created_at` per `agent_id`), non-dismissed and de-duped. Mirrors
 * the server's `PrMeta.findings_by_severity` aggregation so the hover-card total
 * matches the column chips.
 */
export function currentFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const latestByAgent = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const key = r.agent_id ?? "∅"; // group null-agent reviews together
    const prev = latestByAgent.get(key);
    // created_at is an ISO string → lexicographic compare == chronological.
    if (!prev || r.created_at > prev.created_at) latestByAgent.set(key, r);
  }
  const acc = new Map<string, FindingRecord>();
  for (const r of latestByAgent.values()) pushUnique(acc, r.findings);
  return [...acc.values()];
}
