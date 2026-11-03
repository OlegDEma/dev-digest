import { describe, it, expect } from 'vitest';
import type { EvalExpectedItem } from '@devdigest/shared';
import {
  aggregate,
  caseStatus,
  caseSummary,
  labelFindings,
  matchesMustFind,
  matchesMustNotFlag,
  type AggregateInput,
  type ScorableFinding,
} from '../src/modules/evals/scoring.js';

const mf = (
  start: number,
  end: number,
  file = 'src/a.ts',
  severity: EvalExpectedItem['severity'] = 'WARNING',
  category: EvalExpectedItem['category'] = 'bug',
): EvalExpectedItem => ({ kind: 'must_find', file, start_line: start, end_line: end, severity, category });
const mnf = (start: number, end: number, file = 'src/a.ts'): EvalExpectedItem => ({
  kind: 'must_not_flag',
  file,
  start_line: start,
  end_line: end,
});
const f = (start: number, end: number, file = 'src/a.ts'): ScorableFinding => ({
  file,
  start_line: start,
  end_line: end,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
});

describe('matchesMustFind (AC-D42)', () => {
  it.each([
    ['same range', f(10, 12), mf(10, 12), true],
    ['overlap at the end line', f(12, 15), mf(10, 12), true],
    ['overlap at the start line', f(5, 10), mf(10, 12), true],
    ['one past the end', f(13, 15), mf(10, 12), false],
    ['one before the start', f(5, 9), mf(10, 12), false],
    ['finding contains expectation', f(1, 100), mf(10, 12), true],
    ['other file', f(10, 12, 'src/b.ts'), mf(10, 12), false],
    ['wrong severity', f(10, 12), mf(10, 12, 'src/a.ts', 'CRITICAL'), false],
    ['wrong category', f(10, 12), mf(10, 12, 'src/a.ts', 'WARNING', 'security'), false],
  ])('%s', (_n, finding, exp, want) => {
    expect(matchesMustFind(finding, exp)).toBe(want);
  });

  it('ignores the title', () => {
    expect(matchesMustFind({ ...f(10, 12), title: 'other' }, { ...mf(10, 12), title: 'x' })).toBe(true);
  });

  it('an item without end_line is a single line', () => {
    const item: EvalExpectedItem = { kind: 'must_find', file: 'src/a.ts', start_line: 10, severity: 'WARNING', category: 'bug' };
    expect(matchesMustFind(f(10, 10), item)).toBe(true);
    expect(matchesMustFind(f(11, 12), item)).toBe(false);
  });
});

describe('matchesMustNotFlag (AC-D43)', () => {
  it('is location-only when the item has no severity/category', () => {
    const crit = { ...f(10, 12), severity: 'CRITICAL' as const, category: 'perf' as const };
    expect(matchesMustNotFlag(crit, mnf(10, 12))).toBe(true);
    expect(matchesMustNotFlag(f(13, 14), mnf(10, 12))).toBe(false);
  });
  it('also compares severity and category when the item carries them', () => {
    const item: EvalExpectedItem = { ...mnf(10, 12), severity: 'CRITICAL' };
    expect(matchesMustNotFlag(f(10, 12), item)).toBe(false);
    expect(matchesMustNotFlag({ ...f(10, 12), severity: 'CRITICAL' }, item)).toBe(true);
    expect(matchesMustNotFlag(f(10, 12), { ...mnf(10, 12), category: 'security' })).toBe(false);
  });
});

describe('labelFindings / caseStatus (AC-D44, AC-D45)', () => {
  it('first match is tp, a second finding on the same lines is unlabelled', () => {
    const exp = [mf(10, 12)];
    const l = labelFindings([f(10, 12), f(10, 12), f(50, 51)], exp);
    expect(l.map((x) => x.label)).toEqual(['tp', 'unlabelled', 'unlabelled']);
    expect(caseStatus(exp, l)).toBe('pass');
  });

  it('two must_find items on the same lines each take one finding, in list order', () => {
    const exp = [mf(10, 12), mf(10, 12)];
    const l = labelFindings([f(10, 12), f(10, 12), f(10, 12)], exp);
    expect(l.map((x) => x.label)).toEqual(['tp', 'tp', 'unlabelled']);
    expect(caseStatus(exp, l)).toBe('pass');
  });

  it('every must_find needs a tp: one of two missing fails', () => {
    const exp = [mf(10, 12), mf(40, 41)];
    const l = labelFindings([f(10, 12)], exp);
    expect(caseStatus(exp, l)).toBe('fail');
  });

  it('EC-D7: right lines, wrong severity is unlabelled and the case fails', () => {
    const exp = [mf(10, 12, 'src/a.ts', 'CRITICAL')];
    const l = labelFindings([f(10, 12)], exp);
    expect(l.map((x) => x.label)).toEqual(['unlabelled']);
    expect(caseStatus(exp, l)).toBe('fail');
  });

  it('must_not_flag: a match is forbidden and fails; no match passes', () => {
    const exp = [mnf(10, 12)];
    const hit = labelFindings([f(11, 11), f(11, 11)], exp);
    expect(hit.map((x) => x.label)).toEqual(['forbidden', 'forbidden']);
    expect(caseStatus(exp, hit)).toBe('fail');
    const miss = labelFindings([f(50, 51)], exp);
    expect(miss.map((x) => x.label)).toEqual(['unlabelled']);
    expect(caseStatus(exp, miss)).toBe('pass');
    expect(caseStatus(exp, [])).toBe('pass');
  });

  it('EC-D8: any finding on a silent case (empty list) is forbidden', () => {
    const l = labelFindings([f(1, 1)], []);
    expect(l.map((x) => x.label)).toEqual(['forbidden']);
    expect(caseStatus([], l)).toBe('fail');
    expect(caseStatus([], [])).toBe('pass');
  });

  it('EC-D9: a finding matching a must_find and a must_not_flag item is tp', () => {
    const exp = [mnf(10, 12), mf(10, 12)];
    expect(labelFindings([f(10, 12)], exp).map((x) => x.label)).toEqual(['tp']);
  });

  it('a second finding on a hit must_find that also matches a must_not_flag is forbidden', () => {
    const exp = [mf(10, 12), mnf(10, 12)];
    expect(labelFindings([f(10, 12), f(10, 12)], exp).map((x) => x.label)).toEqual(['tp', 'forbidden']);
  });
});

describe('caseSummary (AC-D46)', () => {
  it('singular and plural, with grounded finding count', () => {
    expect(caseSummary([mf(10, 12)], labelFindings([f(10, 12)], [mf(10, 12)]))).toBe('expected 1 finding, got 1');
    const two = [mf(10, 12), mf(20, 21)];
    expect(caseSummary(two, labelFindings([], two))).toBe('expected 2 findings, got 0');
    expect(caseSummary([], [])).toBe('expected 0 findings, got 0');
  });
  it('adds the forbidden hits only when the case has must_not_flag items', () => {
    const exp = [mf(10, 12), mnf(30, 32)];
    const l = labelFindings([f(10, 12), f(31, 31)], exp);
    expect(caseSummary(exp, l)).toBe('expected 1 finding, got 2 · 1 forbidden hit');
    expect(caseSummary([mnf(30, 32)], labelFindings([], [mnf(30, 32)]))).toBe(
      'expected 0 findings, got 0 · 0 forbidden hits',
    );
  });
  it('a silent case does not get the forbidden suffix', () => {
    expect(caseSummary([], labelFindings([f(1, 1)], []))).toBe('expected 0 findings, got 1');
  });
});

function scored(
  exp: EvalExpectedItem[],
  findings: ScorableFinding[],
  grounded: number,
  dropped: number,
  cost: number | null = 0.01,
): AggregateInput {
  const labelled = labelFindings(findings, exp);
  return { status: caseStatus(exp, labelled), expected: exp, findings: labelled, grounded, dropped, costUsd: cost };
}
const errored = (exp: EvalExpectedItem[]): AggregateInput => ({
  status: 'error',
  expected: exp,
  findings: [],
  grounded: 0,
  dropped: 0,
  costUsd: null,
});

describe('aggregate (AC-D48)', () => {
  const cases = [
    scored([mf(10, 12)], [f(10, 12), f(40, 41)], 2, 1), // tp + 1 unlabelled
    scored([mf(20, 22)], [], 0, 0), // fn
    scored([mnf(30, 32)], [f(31, 31)], 1, 0), // forbidden
    scored([mnf(60, 62)], [], 0, 1), // pass, nothing emitted
  ];

  it('pooled, strict and macro values over items', () => {
    const a = aggregate(cases);
    expect(a.status).toBe('done');
    expect(a.counts).toEqual({
      cases_total: 4,
      cases_scored: 4,
      cases_passed: 2,
      cases_failed: 2,
      cases_error: 0,
      must_find_total: 2,
      must_not_flag_total: 2,
      silent_total: 0,
      tp: 1,
      fn: 1,
      forbidden_hits: 1,
      unlabelled: 1,
      emitted: 3,
      grounded: 3,
      dropped: 2,
    });
    expect(a.metrics).toEqual({
      recall: 0.5,
      precision: 0.5,
      strict_precision: 1 / 3,
      citation_accuracy: 3 / 5,
      macro_recall: 0.5,
      macro_precision: 0.5,
    });
    expect(a.costUsd).toBeCloseTo(0.04);
  });

  it('counts items, not cases: a case with 2 must_find and 1 must_not_flag', () => {
    const exp = [mf(10, 12), mf(20, 22), mnf(30, 32)];
    const a = aggregate([scored(exp, [f(10, 12)], 1, 0)]);
    expect(a.counts).toMatchObject({ must_find_total: 2, must_not_flag_total: 1, tp: 1, fn: 1, forbidden_hits: 0 });
    expect(a.metrics?.recall).toBe(0.5);
    expect(a.metrics?.macro_recall).toBe(0.5);
  });

  it('silent cases: silent_total, forbidden_hits include them, precision falls (EC-D8)', () => {
    const a = aggregate([scored([mf(10, 12)], [f(10, 12)], 1, 0), scored([], [f(1, 1), f(2, 2)], 2, 0), scored([], [], 0, 0)]);
    expect(a.counts).toMatchObject({
      silent_total: 2,
      must_find_total: 1,
      tp: 1,
      forbidden_hits: 2,
      cases_passed: 2,
      cases_failed: 1,
    });
    expect(a.metrics?.precision).toBeCloseTo(1 / 3);
  });

  it('only must_not_flag with no hits: recall/precision null, cases pass (EC-17)', () => {
    const a = aggregate([scored([mnf(1, 2)], [], 0, 0), scored([mnf(5, 6)], [f(50, 51)], 1, 0)]);
    expect(a.status).toBe('done');
    expect(a.metrics?.recall).toBeNull();
    expect(a.metrics?.precision).toBeNull();
    expect(a.metrics?.macro_recall).toBeNull();
    expect(a.metrics?.macro_precision).toBeNull();
    expect(a.metrics?.strict_precision).toBe(0);
    expect(a.counts.cases_passed).toBe(2);
  });

  it('citation accuracy is null when nothing was grounded or dropped', () => {
    expect(aggregate([scored([mnf(1, 2)], [], 0, 0)]).metrics?.citation_accuracy).toBeNull();
  });

  it('an error case counts only in cases_error and is excluded from every metric', () => {
    const withErr = aggregate([...cases, errored([mf(70, 71)])]);
    const without = aggregate(cases);
    expect(withErr.status).toBe('partial');
    expect(withErr.metrics).toEqual(without.metrics);
    expect(withErr.counts).toEqual({ ...without.counts, cases_total: 5, cases_error: 1 });
    expect(withErr.costUsd).toBeNull();
  });

  it('every case errored: failed, metrics null', () => {
    const a = aggregate([errored([mf(1, 2)]), errored([mnf(3, 4)])]);
    expect(a.status).toBe('failed');
    expect(a.metrics).toBeNull();
    expect(a.counts).toMatchObject({ cases_total: 2, cases_scored: 0, cases_error: 2, tp: 0 });
  });

  it('is deterministic and takes plain data only (no LLM can be passed in)', () => {
    expect(aggregate(cases)).toEqual(aggregate(cases));
    expect(labelFindings([f(10, 12)], [mf(10, 12)])).toEqual(labelFindings([f(10, 12)], [mf(10, 12)]));
  });
});
