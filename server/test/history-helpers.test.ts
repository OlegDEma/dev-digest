import { describe, it, expect } from 'vitest';
import type { PrTouchingFile } from '@devdigest/shared';
import { pickFiles, toPrHistory } from '../src/modules/history/helpers.js';

const row = (number: number, path: string, merged_at: string | null, title = `t${number}`): PrTouchingFile => ({
  number,
  title,
  merged_at,
  author: 'a',
  path,
});

describe('toPrHistory', () => {
  const rows = [
    row(1, 'a.ts', '2026-01-01T00:00:00Z'),
    row(1, 'b.ts', '2026-01-01T00:00:00Z'),
    row(2, 'a.ts', '2026-03-01T00:00:00Z'),
    row(3, 'a.ts', null), // unmerged
    row(9, 'a.ts', '2026-05-01T00:00:00Z'), // the current PR
  ];

  it('drops unmerged and the current PR, aggregates overlap, newest first, empty notes', () => {
    const out = toPrHistory(rows, 9, 5);
    expect(out.map((i) => i.pr_number)).toEqual([2, 1]);
    expect(out[1]!.files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(out.every((i) => i.notes === '')).toBe(true);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 8 }, (_, i) => row(i + 1, 'a.ts', `2026-01-0${i + 1}T00:00:00Z`));
    const out = toPrHistory(many, 99, 5);
    expect(out).toHaveLength(5);
    expect(out[0]!.pr_number).toBe(8);
  });
});

describe('pickFiles', () => {
  it('orders by churn then path and caps', () => {
    const files = [
      { path: 'b.ts', additions: 1, deletions: 1 },
      { path: 'a.ts', additions: 1, deletions: 1 },
      { path: 'c.ts', additions: 10, deletions: 0 },
    ];
    expect(pickFiles(files, 2)).toEqual(['c.ts', 'a.ts']);
  });
});
