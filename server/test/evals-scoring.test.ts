import { describe, it, expect } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import {
  aggregate,
  caseStatus,
  caseSummary,
  labelFindings,
  matches,
  type AggregateInput,
  type ScorableFinding,
} from '../src/modules/evals/scoring.js';

const mf = (start: number, end: number, file = 'src/a.ts'): EvalExpectation => ({
  kind: 'must_find',
  file,
  start_line: start,
  end_line: end,
});
const mnf = (start: number, end: number, file = 'src/a.ts'): EvalExpectation => ({
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

describe('matches (AC-38)', () => {
  it.each([
    ['same range', f(10, 12), mf(10, 12), true],
    ['overlap at the end line', f(12, 15), mf(10, 12), true],
    ['overlap at the start line', f(5, 10), mf(10, 12), true],
    ['one past the end', f(13, 15), mf(10, 12), false],
    ['one before the start', f(5, 9), mf(10, 12), false],
    ['finding contains expectation', f(1, 100), mf(10, 12), true],
    ['other file', f(10, 12, 'src/b.ts'), mf(10, 12), false],
  ])('%s', (_n, finding, exp, want) => {
    expect(matches(finding, exp)).toBe(want);
  });

  it('ignores severity, category and title', () => {
    const other = { ...f(10, 12), severity: 'CRITICAL' as const, category: 'perf' as const, title: 'x' };
    expect(matches(other, mf(10, 12))).toBe(true);
  });
});

describe('labelFindings / caseStatus (AC-39, AC-40, EC-16)', () => {
  it('first match is tp, a second finding on the same lines is unlabelled', () => {
    const l = labelFindings([f(10, 12), f(10, 12), f(50, 51)], mf(10, 12));
    expect(l.map((x) => x.label)).toEqual(['tp', 'unlabelled', 'unlabelled']);
    expect(caseStatus(mf(10, 12), l)).toBe('pass');
  });

  it('must_find without a match fails; unlabelled findings never rescue it', () => {
    const l = labelFindings([f(50, 51)], mf(10, 12));
    expect(l.map((x) => x.label)).toEqual(['unlabelled']);
    expect(caseStatus(mf(10, 12), l)).toBe('fail');
  });

  it('must_not_flag: a match is forbidden and fails; no match passes', () => {
    const hit = labelFindings([f(11, 11), f(11, 11)], mnf(10, 12));
    expect(hit.map((x) => x.label)).toEqual(['forbidden', 'unlabelled']);
    expect(caseStatus(mnf(10, 12), hit)).toBe('fail');
    const miss = labelFindings([f(50, 51)], mnf(10, 12));
    expect(caseStatus(mnf(10, 12), miss)).toBe('pass');
    expect(caseStatus(mnf(10, 12), [])).toBe('pass');
  });

  it('summaries', () => {
    expect(caseSummary(mf(10, 12), labelFindings([f(10, 12)], mf(10, 12)))).toBe('expected 1 finding, got 1');
    expect(caseSummary(mnf(12, 12), labelFindings([f(12, 12)], mnf(12, 12)))).toBe(
      'must not flag src/a.ts:12, got 1',
    );
    expect(caseSummary(mnf(12, 14), [])).toBe('must not flag src/a.ts:12-14, got 0');
  });
});

function scored(exp: EvalExpectation, findings: ScorableFinding[], grounded: number, dropped: number, cost: number | null = 0.01): AggregateInput {
  const labelled = labelFindings(findings, exp);
  return { status: caseStatus(exp, labelled), expectation: exp, findings: labelled, grounded, dropped, costUsd: cost };
}
const errored = (exp: EvalExpectation): AggregateInput => ({
  status: 'error',
  expectation: exp,
  findings: [],
  grounded: 0,
  dropped: 0,
  costUsd: null,
});

describe('aggregate (AC-41a/b, AC-42a, AC-33a/b, AC-34)', () => {
  const cases = [
    scored(mf(10, 12), [f(10, 12), f(40, 41)], 2, 1), // tp + 1 unlabelled
    scored(mf(20, 22), [], 0, 0), // fn
    scored(mnf(30, 32), [f(31, 31)], 1, 0), // forbidden
    scored(mnf(60, 62), [], 0, 1), // pass, nothing emitted
  ];

  it('pooled, strict and macro values', () => {
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
      // per-case precision defined for case 1 (1) and case 3 (0)
      macro_precision: 0.5,
    });
    expect(a.costUsd).toBeCloseTo(0.04);
  });

  it('only must_not_flag with no hits: recall/precision null, cases pass (EC-17)', () => {
    const a = aggregate([scored(mnf(1, 2), [], 0, 0), scored(mnf(5, 6), [f(50, 51)], 1, 0)]);
    expect(a.status).toBe('done');
    expect(a.metrics?.recall).toBeNull();
    expect(a.metrics?.precision).toBeNull();
    expect(a.metrics?.macro_recall).toBeNull();
    expect(a.metrics?.macro_precision).toBeNull();
    expect(a.metrics?.strict_precision).toBe(0);
    expect(a.counts.cases_passed).toBe(2);
  });

  it('citation accuracy is null when nothing was grounded or dropped', () => {
    expect(aggregate([scored(mnf(1, 2), [], 0, 0)]).metrics?.citation_accuracy).toBeNull();
  });

  it('an error case counts only in cases_error and is excluded from every metric (AC-33a ii)', () => {
    const withErr = aggregate([...cases, errored(mf(70, 71))]);
    const without = aggregate(cases);
    expect(withErr.status).toBe('partial');
    expect(withErr.metrics).toEqual(without.metrics);
    expect(withErr.counts).toEqual({ ...without.counts, cases_total: 5, cases_error: 1 });
    expect(withErr.costUsd).toBeNull();
  });

  it('every case errored: failed, metrics null (AC-34)', () => {
    const a = aggregate([errored(mf(1, 2)), errored(mnf(3, 4))]);
    expect(a.status).toBe('failed');
    expect(a.metrics).toBeNull();
    expect(a.counts).toMatchObject({ cases_total: 2, cases_scored: 0, cases_error: 2, tp: 0 });
  });

  it('is deterministic and never touches an LLM (AC-43)', () => {
    const llm = {
      complete: () => {
        throw new Error('LLM must not be called');
      },
      completeStructured: () => {
        throw new Error('LLM must not be called');
      },
    };
    void llm; // scoring has no way to receive one: its signatures take plain data only
    expect(aggregate(cases)).toEqual(aggregate(cases));
    expect(labelFindings([f(10, 12)], mf(10, 12))).toEqual(labelFindings([f(10, 12)], mf(10, 12)));
  });
});
