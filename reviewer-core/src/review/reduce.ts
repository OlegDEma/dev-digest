import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';

/**
 * Reduce + slice helpers for map-reduce reviews. Pure (no DB / `this`), so they
 * live in the engine and are shared by the server and the CI runner.
 */

/**
 * Per-severity penalty subtracted from a perfect 100. Chosen so the score
 * tracks the findings the UI actually shows: 0 findings ⇒ 100, one suggestion
 * ⇒ 97, one warning ⇒ 88, one critical ⇒ 65.
 */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  CRITICAL: 35,
  WARNING: 12,
  SUGGESTION: 3,
};

/**
 * Deterministic 0–100 quality score derived from the (grounded) findings —
 * NOT the model's self-reported `score`, which has no anchor and drifts wildly
 * between models (a cheap model can "approve" with zero findings yet emit 10).
 * This mirrors how the review *event* is already computed from severities in
 * `to-review.ts`, so the number on screen can never contradict the findings
 * beneath it.
 */
export function scoreFromFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Verdict severity order for the reduce step (worst verdict wins). */
const VERDICT_RANK: Record<string, number> = {
  request_changes: 2,
  comment: 1,
  approve: 0,
};

/**
 * Merge N partial Reviews (one per mapped file/chunk) into a single Review:
 * concat findings, take the worst verdict, mean score, joined summaries.
 */
export function reduceReviews(partials: Review[]): Review {
  if (partials.length === 1) return partials[0]!;
  const findings = partials.flatMap((p) => p.findings);
  let verdict: Review['verdict'] = 'approve';
  for (const p of partials) {
    if ((VERDICT_RANK[p.verdict] ?? 0) > (VERDICT_RANK[verdict] ?? 0)) verdict = p.verdict;
  }
  const score = partials.length
    ? Math.round(partials.reduce((s, p) => s + p.score, 0) / partials.length)
    : 0;
  const summary = partials.map((p) => p.summary).filter(Boolean).join(' ');
  return { verdict, score, summary, findings };
}

/** Extract the slice of the unified diff for a single file (for map chunks). */
export function sliceDiff(diff: UnifiedDiff, path: string): string {
  const lines = diff.raw.split('\n');
  const out: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (line.startsWith('diff --git'))
      capture = line.includes(`b/${path}`) || line.includes(` ${path}`);
    if (capture) out.push(line);
  }
  if (out.length > 0) return out.join('\n');
  // fallback: synthesize from the file's hunks
  const f = diff.files.find((x) => x.path === path);
  if (!f) return diff.raw;
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}`;
}

const OUT_OF_SCOPE_RE = /^out of scope:/i;
const SEVERITY_RANK: Record<Finding['severity'], number> = { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 };

/**
 * Deterministic "one signal, not twenty" cap for out-of-scope findings.
 * Drops every SUGGESTION-severity `Out of scope:` finding, then keeps only the
 * highest-severity (then highest-confidence) remaining one. Other findings pass.
 */
export function capOutOfScopeFindings(findings: Finding[]): {
  kept: Finding[];
  dropped: Finding[];
} {
  const oos = findings.filter((f) => OUT_OF_SCOPE_RE.test(f.title.trim()));
  if (oos.length === 0) return { kept: findings, dropped: [] };
  const best = oos
    .filter((f) => f.severity !== 'SUGGESTION')
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
    )[0];
  const dropped = oos.filter((f) => f !== best);
  // Collapse, don't hide: the signal finding lists the other serious
  // out-of-scope defects (title + location) so none of them vanishes.
  const folded = dropped.filter((f) => f.severity !== 'SUGGESTION');
  const signal: Finding | undefined =
    best && folded.length > 0
      ? {
          ...best,
          rationale: `${best.rationale}\n\n**Also out of scope (${folded.length}):**\n${folded
            .map((f) => `- [${f.severity}] ${f.title.replace(OUT_OF_SCOPE_RE, '').trim()} — \`${f.file}:${f.start_line}\``)
            .join('\n')}`,
        }
      : best;
  const kept = findings.flatMap((f) =>
    !OUT_OF_SCOPE_RE.test(f.title.trim()) ? [f] : f === best && signal ? [signal] : [],
  );
  return { kept, dropped };
}
