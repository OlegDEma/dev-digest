import { describe, it, expect } from 'vitest';
import { SmartDiffResponse } from '@devdigest/shared';
import { buildSmartDiff, findingLinesByPath } from '../src/modules/smart-diff/helpers.js';

describe('findingLinesByPath', () => {
  it('sorts and de-dupes lines per file', () => {
    const m = findingLinesByPath([
      { file: 'a.ts', startLine: 9 },
      { file: 'a.ts', startLine: 2 },
      { file: 'a.ts', startLine: 9 },
      { file: 'b.ts', startLine: 1 },
    ]);
    expect(m.get('a.ts')).toEqual([2, 9]);
    expect(m.get('b.ts')).toEqual([1]);
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'pnpm-lock.yaml', additions: 10, deletions: 2 },
    { path: 'README.md', additions: 1, deletions: 0 },
    { path: 'src/a.test.ts', additions: 5, deletions: 1 },
    { path: 'src/a.ts', additions: 4, deletions: 3 },
  ];

  it('returns all five groups in ROLE_ORDER (empty ones included) and attaches finding lines', () => {
    const out = buildSmartDiff(files, new Map([['src/a.ts', [3]]]));
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(out.groups.map((g) => g.files.length)).toEqual([1, 1, 0, 1, 1]);
    expect(out.groups[0]!.files[0]!.finding_lines).toEqual([3]);
    expect(out.groups[4]!.files[0]!.path).toBe('pnpm-lock.yaml');
    expect(out.groups[1]!.files[0]!.finding_lines).toEqual([]);
  });

  it('returns the no-split value and a contract-valid body', () => {
    const out = buildSmartDiff(files, new Map());
    expect(out.split_suggestion).toEqual({ too_big: false, total_lines: 26, proposed_splits: [] });
    expect(() => SmartDiffResponse.parse(out)).not.toThrow();
  });

  it('returns five empty groups for no files', () => {
    const out = buildSmartDiff([], new Map());
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(out.groups.every((g) => g.files.length === 0)).toBe(true);
  });
});
