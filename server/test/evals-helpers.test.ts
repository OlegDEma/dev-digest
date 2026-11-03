import { describe, it, expect } from 'vitest';
import {
  caseNameFor,
  configId,
  expectedFromResult,
  sliceFileDiff,
  toEvalCaseDto,
  toEvalCaseResultDto,
  toEvalRunSummaryDto,
} from '../src/modules/evals/helpers.js';
import type { EvalCaseResultRow, EvalCaseRow, EvalRunRow } from '../src/modules/evals/repository/types.js';

describe('caseNameFor (AC-4a, AC-4b)', () => {
  it('slugifies', () => {
    expect(caseNameFor('SQL injection in `query()`!', new Set())).toBe('sql-injection-in-query');
  });
  it('adds -2, -3 on a clash', () => {
    const taken = new Set<string>();
    const names = [1, 2, 3].map(() => {
      const n = caseNameFor('Same title', taken);
      taken.add(n);
      return n;
    });
    expect(names).toEqual(['same-title', 'same-title-2', 'same-title-3']);
  });
  it('stays within 60 chars including the suffix', () => {
    const title = 'a'.repeat(80);
    const taken = new Set([caseNameFor(title, new Set())]);
    const second = caseNameFor(title, taken);
    expect(second.length).toBeLessThanOrEqual(60);
    expect(second.endsWith('-2')).toBe(true);
    expect(taken.has(second)).toBe(false);
  });
});

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' one',
  '+two',
  '@@ -20,2 +21,3 @@',
  ' x',
  '+y',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
].join('\n');

describe('sliceFileDiff (AC-3a)', () => {
  it('returns one file with all its hunks and nothing else', () => {
    const s = sliceFileDiff(RAW, 'src/a.ts');
    expect(s).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(s.match(/^@@/gm)).toHaveLength(2);
    expect(s).not.toContain('src/b.ts');
  });
  it('returns the last file too', () => {
    const s = sliceFileDiff(RAW, 'src/b.ts');
    expect(s).toContain('+new');
    expect(s).not.toContain('src/a.ts');
  });
  it('returns "" for a file not in the diff', () => {
    expect(sliceFileDiff(RAW, 'src/c.ts')).toBe('');
    expect(sliceFileDiff('', 'src/a.ts')).toBe('');
  });
  it('does not match a path that merely ends with the file name', () => {
    expect(sliceFileDiff(RAW, 'a.ts')).toBe('');
  });
});

describe('configId (AC-47)', () => {
  const base = {
    agent_version: 3,
    provider: 'openai' as const,
    model: 'gpt-4o',
    system_prompt: 'p',
    strategy: 'single-pass' as const,
    skills: [{ skill_id: 's1', name: 'S', version: 1 }],
  };
  it('is stable for equal snapshots', () => {
    expect(configId(base)).toBe(configId({ ...base, skills: [{ ...base.skills[0]! }] }));
  });
  it.each([
    ['agent_version', { agent_version: 4 }],
    ['provider', { provider: 'anthropic' as const }],
    ['model', { model: 'gpt-4.1' }],
    ['system_prompt', { system_prompt: 'q' }],
    ['strategy', { strategy: 'auto' as const }],
    ['skill version', { skills: [{ skill_id: 's1', name: 'S', version: 2 }] }],
    ['skill set', { skills: [] }],
  ])('changes when %s changes', (_n, patch) => {
    expect(configId({ ...base, ...patch })).not.toBe(configId(base));
  });
});


const NOW = new Date('2026-10-31T00:00:00.000Z');
const caseRow = (patch: Partial<EvalCaseRow> = {}): EvalCaseRow => ({
  id: 'c1',
  workspaceId: 'w1',
  ownerKind: 'agent',
  ownerId: 'a1',
  name: 'null-deref',
  inputDiff: 'diff',
  inputFiles: null,
  inputMeta: null,
  expectedOutput: null,
  notes: null,
  agentId: 'a1',
  sourceFindingId: 'f1',
  sourcePrNumber: 7,
  sourceRepo: 'o/r',
  expectationKind: 'must_find',
  expectationFile: 'src/a.ts',
  expectationStartLine: 3,
  expectationEndLine: 5,
  displayTitle: 'Null deref',
  displaySeverity: 'CRITICAL',
  displayCategory: 'security',
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

describe('toEvalCaseDto legacy mapping (AC-D24)', () => {
  it('a legacy must_find case becomes one item carrying display severity and category', () => {
    const dto = toEvalCaseDto(caseRow(), null);
    expect(dto.expected).toEqual([
      { kind: 'must_find', file: 'src/a.ts', start_line: 3, end_line: 5, severity: 'CRITICAL', category: 'security' },
    ]);
    expect(dto.input_files).toEqual([]);
    expect(dto.pr_meta).toEqual({ title: '', description: '' });
    expect(dto.revision).toBe(1);
    expect(dto.display).toEqual({ title: 'Null deref', severity: 'CRITICAL', category: 'security' });
    expect(dto.source).toEqual({ finding_id: 'f1', pr_number: 7, repo: 'o/r' });
    expect(dto.name).toBe('null-deref');
    expect(dto.input_diff).toBe('diff');
  });

  it('a legacy must_not_flag case becomes a location-only item', () => {
    const dto = toEvalCaseDto(caseRow({ expectationKind: 'must_not_flag' }), null);
    expect(dto.expected).toEqual([{ kind: 'must_not_flag', file: 'src/a.ts', start_line: 3, end_line: 5 }]);
  });

  it('expected_output wins over the legacy columns, including an empty (silent) list', () => {
    const item = { kind: 'must_find', file: 'x.ts', start_line: 1, severity: 'WARNING', category: 'bug' };
    expect(toEvalCaseDto(caseRow({ expectedOutput: [item] }), null).expected).toEqual([item]);
    expect(toEvalCaseDto(caseRow({ expectedOutput: [] }), null).expected).toEqual([]);
  });

  it('a hand-written case has null display and source and its own content', () => {
    const dto = toEvalCaseDto(
      caseRow({
        expectedOutput: [],
        expectationFile: null,
        displayTitle: null,
        sourceFindingId: null,
        sourcePrNumber: null,
        sourceRepo: null,
        inputFiles: [{ path: 'ctx.ts', content: 'x' }],
        inputMeta: { title: 'T', description: 'D' },
        revision: 4,
      }),
      null,
    );
    expect(dto.display).toBeNull();
    expect(dto.source).toBeNull();
    expect(dto.input_files).toEqual([{ path: 'ctx.ts', content: 'x' }]);
    expect(dto.pr_meta).toEqual({ title: 'T', description: 'D' });
    expect(dto.revision).toBe(4);
  });

  it('last_result carries duration, cost and case_revision (null reads as 1)', () => {
    const last = { runId: 'r1', status: 'pass' as const, ranAt: NOW, summary: 's', durationMs: 12, costUsd: 0.5, caseRevision: null };
    expect(toEvalCaseDto(caseRow(), last).last_result).toEqual({
      run_id: 'r1',
      status: 'pass',
      ran_at: NOW.toISOString(),
      summary: 's',
      duration_ms: 12,
      cost_usd: 0.5,
      case_revision: 1,
    });
    expect(toEvalCaseDto(caseRow(), { ...last, caseRevision: 3 }).last_result?.case_revision).toBe(3);
  });
});

describe('result and run mappers', () => {
  const resultRow = (expectation: unknown, caseRevision: number | null): EvalCaseResultRow =>
    ({
      id: 'x',
      runId: 'r',
      caseId: 'c1',
      position: 0,
      caseName: 'n',
      expectation,
      caseRevision,
      status: 'pass',
      findings: [],
      grounded: 0,
      dropped: 0,
      summary: 's',
      costUsd: null,
      durationMs: null,
      error: null,
      finishedAt: NOW,
    }) as EvalCaseResultRow;

  it('wraps a legacy single-object expectation and reads a null revision as 1', () => {
    const dto = toEvalCaseResultDto(
      resultRow({ kind: 'must_not_flag', file: 'a.ts', start_line: 2, end_line: 4 }, null),
    );
    expect(dto.expected).toEqual([{ kind: 'must_not_flag', file: 'a.ts', start_line: 2, end_line: 4 }]);
    expect(dto.case_revision).toBe(1);
  });

  it('passes a stored list through with its revision', () => {
    const list = [{ kind: 'must_find', file: 'a.ts', start_line: 1, severity: 'WARNING', category: 'bug' }];
    const dto = toEvalCaseResultDto(resultRow(list, 5));
    expect(dto.expected).toEqual(list);
    expect(dto.case_revision).toBe(5);
    expect(expectedFromResult(null)).toEqual([]);
  });

  const runRow = (status: EvalRunRow['status'], scope: EvalRunRow['scope'] = 'all'): EvalRunRow =>
    ({
      id: 'r',
      workspaceId: 'w',
      agentId: 'a',
      agentName: 'A',
      status,
      scope,
      startedAt: NOW,
      finishedAt: null,
      progressDone: 0,
      progressTotal: 1,
      config: {},
      caseIds: [],
      counts: null,
      recall: 0.5,
      precision: 0.5,
      strictPrecision: 0.5,
      citationAccuracy: 0.5,
      macroRecall: 0.5,
      macroPrecision: 0.5,
      durationMs: null,
      costUsd: null,
      error: null,
    }) as EvalRunRow;

  it('carries scope and hides metrics for queued, running and failed runs', () => {
    expect(toEvalRunSummaryDto(runRow('done', 'case')).scope).toBe('case');
    for (const s of ['queued', 'running', 'failed'] as const) {
      expect(toEvalRunSummaryDto(runRow(s)).metrics).toBeNull();
    }
    expect(toEvalRunSummaryDto(runRow('done')).metrics?.recall).toBe(0.5);
  });
});
