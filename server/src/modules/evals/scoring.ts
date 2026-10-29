import type {
  EvalCaseStatus,
  EvalCounts,
  EvalExpectation,
  EvalFindingLabel,
  EvalMetrics,
  EvalRunStatus,
  FindingCategory,
  Severity,
} from '@devdigest/shared';

/**
 * Pure eval scoring (AC-38…AC-43). No container, no I/O, no LLM: the same
 * engine outputs always produce the same labels, counts and metrics.
 */

export interface ScorableFinding {
  file: string;
  start_line: number;
  end_line: number;
  severity: Severity;
  category: FindingCategory;
  title: string;
}

export type LabelledFinding = ScorableFinding & { label: EvalFindingLabel };

/** Same file and intersecting [start, end] line ranges; severity/category/title are ignored. */
export function matches(f: ScorableFinding, e: EvalExpectation): boolean {
  return f.file === e.file && f.start_line <= e.end_line && e.start_line <= f.end_line;
}

/** Greedy, in engine output order: the first match gets the expectation's label, the rest are unlabelled. */
export function labelFindings(
  findings: readonly ScorableFinding[],
  expectation: EvalExpectation,
): LabelledFinding[] {
  const own: EvalFindingLabel = expectation.kind === 'must_find' ? 'tp' : 'forbidden';
  let taken = false;
  return findings.map((f) => {
    if (!taken && matches(f, expectation)) {
      taken = true;
      return { ...f, label: own };
    }
    return { ...f, label: 'unlabelled' as const };
  });
}

/** `pass` when a must_find has a tp, or a must_not_flag has no forbidden finding. */
export function caseStatus(
  expectation: EvalExpectation,
  labelled: readonly LabelledFinding[],
): 'pass' | 'fail' {
  if (expectation.kind === 'must_find') {
    return labelled.some((f) => f.label === 'tp') ? 'pass' : 'fail';
  }
  return labelled.some((f) => f.label === 'forbidden') ? 'fail' : 'pass';
}

export function rangeLabel(e: EvalExpectation): string {
  return e.end_line === e.start_line ? `${e.file}:${e.start_line}` : `${e.file}:${e.start_line}-${e.end_line}`;
}

export function caseSummary(
  expectation: EvalExpectation,
  labelled: readonly LabelledFinding[],
): string {
  if (expectation.kind === 'must_find') {
    const got = labelled.filter((f) => f.label === 'tp').length;
    return `expected 1 finding, got ${got}`;
  }
  const got = labelled.filter((f) => f.label === 'forbidden').length;
  return `must not flag ${rangeLabel(expectation)}, got ${got}`;
}

/** What `aggregate` needs from one finished case. */
export interface AggregateInput {
  status: EvalCaseStatus;
  expectation: EvalExpectation;
  findings: readonly { label: EvalFindingLabel }[];
  grounded: number;
  dropped: number;
  costUsd: number | null;
}

export interface Aggregate {
  status: Exclude<EvalRunStatus, 'running'>;
  metrics: EvalMetrics | null;
  counts: EvalCounts;
  /** Sum of case costs; null when any case cost is unknown (errored cases have none). */
  costUsd: number | null;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Aggregate over SCORED cases only; `error` cases count only in `cases_error`.
 * All cases errored → `failed` with `metrics: null`; some errored → `partial`.
 */
export function aggregate(results: readonly AggregateInput[]): Aggregate {
  const scored = results.filter((r) => r.status !== 'error');
  const errored = results.length - scored.length;

  let tp = 0;
  let forbidden = 0;
  let unlabelled = 0;
  let emitted = 0;
  let grounded = 0;
  let dropped = 0;
  let mustFind = 0;
  let mustNotFlag = 0;
  let passed = 0;
  const perCaseRecall: number[] = [];
  const perCasePrecision: number[] = [];

  for (const r of scored) {
    const caseTp = r.findings.filter((f) => f.label === 'tp').length;
    const caseForbidden = r.findings.filter((f) => f.label === 'forbidden').length;
    tp += caseTp;
    forbidden += caseForbidden;
    unlabelled += r.findings.filter((f) => f.label === 'unlabelled').length;
    emitted += r.findings.length;
    grounded += r.grounded;
    dropped += r.dropped;
    if (r.status === 'pass') passed++;
    if (r.expectation.kind === 'must_find') {
      mustFind++;
      perCaseRecall.push(caseTp > 0 ? 1 : 0);
    } else {
      mustNotFlag++;
    }
    if (caseTp + caseForbidden > 0) perCasePrecision.push(caseTp / (caseTp + caseForbidden));
  }

  const counts: EvalCounts = {
    cases_total: results.length,
    cases_scored: scored.length,
    cases_passed: passed,
    cases_failed: scored.length - passed,
    cases_error: errored,
    must_find_total: mustFind,
    must_not_flag_total: mustNotFlag,
    tp,
    fn: scored.filter(
      (r) => r.expectation.kind === 'must_find' && !r.findings.some((f) => f.label === 'tp'),
    ).length,
    forbidden_hits: forbidden,
    unlabelled,
    emitted,
    grounded,
    dropped,
  };

  const costUsd = results.some((r) => r.costUsd == null)
    ? null
    : results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  if (scored.length === 0) return { status: 'failed', metrics: null, counts, costUsd };

  return {
    status: errored > 0 ? 'partial' : 'done',
    metrics: {
      recall: ratio(tp, mustFind),
      precision: ratio(tp, tp + forbidden),
      strict_precision: ratio(tp, emitted),
      citation_accuracy: ratio(grounded, grounded + dropped),
      macro_recall: mean(perCaseRecall),
      macro_precision: mean(perCasePrecision),
    },
    counts,
    costUsd,
  };
}
