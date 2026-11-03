import type {
  EvalCaseStatus,
  EvalCounts,
  EvalExpectedItem,
  EvalFindingLabel,
  EvalMetrics,
  EvalRunStatus,
  FindingCategory,
  Severity,
} from '@devdigest/shared';

/**
 * Pure eval scoring (AC-D42…AC-D48). No container, no I/O, no LLM: the same
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

const endOf = (e: EvalExpectedItem): number => e.end_line ?? e.start_line;

function sameLocation(f: ScorableFinding, e: EvalExpectedItem): boolean {
  return f.file === e.file && f.start_line <= endOf(e) && e.start_line <= f.end_line;
}

/** File, intersecting line range, severity and category must all match; the title is ignored (AC-D42). */
export function matchesMustFind(f: ScorableFinding, e: EvalExpectedItem): boolean {
  return sameLocation(f, e) && f.severity === e.severity && f.category === e.category;
}

/** Location always; severity/category only when the item carries them (AC-D43). */
export function matchesMustNotFlag(f: ScorableFinding, e: EvalExpectedItem): boolean {
  return (
    sameLocation(f, e) &&
    (e.severity === undefined || f.severity === e.severity) &&
    (e.category === undefined || f.category === e.category)
  );
}

/**
 * One label per finding, in engine output order (AC-D44): `tp` on the first
 * not-yet-hit `must_find` item in list order, else `forbidden` when any
 * `must_not_flag` item matches or the list is empty, else `unlabelled`.
 */
export function labelFindings(
  findings: readonly ScorableFinding[],
  expected: readonly EvalExpectedItem[],
): LabelledFinding[] {
  const hit = new Set<number>();
  return findings.map((f) => {
    const idx = expected.findIndex((e, i) => e.kind === 'must_find' && !hit.has(i) && matchesMustFind(f, e));
    if (idx >= 0) {
      hit.add(idx);
      return { ...f, label: 'tp' as const };
    }
    if (expected.length === 0 || expected.some((e) => e.kind === 'must_not_flag' && matchesMustNotFlag(f, e))) {
      return { ...f, label: 'forbidden' as const };
    }
    return { ...f, label: 'unlabelled' as const };
  });
}

const mustFindCount = (expected: readonly EvalExpectedItem[]) =>
  expected.filter((e) => e.kind === 'must_find').length;

/** `pass` when every `must_find` item has a tp and nothing is forbidden (AC-D45). */
export function caseStatus(
  expected: readonly EvalExpectedItem[],
  labelled: readonly LabelledFinding[],
): 'pass' | 'fail' {
  const tp = labelled.filter((f) => f.label === 'tp').length;
  const forbidden = labelled.some((f) => f.label === 'forbidden');
  return tp === mustFindCount(expected) && !forbidden ? 'pass' : 'fail';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "expected <n> finding(s), got <m>" (+ " · <k> forbidden hit(s)" when the case has must_not_flag items) (AC-D46). */
export function caseSummary(
  expected: readonly EvalExpectedItem[],
  labelled: readonly LabelledFinding[],
): string {
  const base = `expected ${plural(mustFindCount(expected), 'finding', 'findings')}, got ${labelled.length}`;
  if (!expected.some((e) => e.kind === 'must_not_flag')) return base;
  const k = labelled.filter((f) => f.label === 'forbidden').length;
  return `${base} · ${plural(k, 'forbidden hit', 'forbidden hits')}`;
}

/** What `aggregate` needs from one finished case. */
export interface AggregateInput {
  status: EvalCaseStatus;
  expected: readonly EvalExpectedItem[];
  findings: readonly { label: EvalFindingLabel }[];
  grounded: number;
  dropped: number;
  costUsd: number | null;
}

export interface Aggregate {
  status: Exclude<EvalRunStatus, 'queued' | 'running'>;
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
  let silent = 0;
  let fn = 0;
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
    const caseMustFind = mustFindCount(r.expected);
    mustFind += caseMustFind;
    mustNotFlag += r.expected.length - caseMustFind;
    if (r.expected.length === 0) silent++;
    if (caseMustFind > 0) {
      fn += caseMustFind - caseTp;
      perCaseRecall.push(caseTp / caseMustFind);
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
    silent_total: silent,
    tp,
    fn,
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
