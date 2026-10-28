import { describe, it, expect } from 'vitest';
import type { PrBlastResponse, PrIntentRecord } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  briefLogPayload,
  callersFromBlast,
  fileFacts,
  finalizeSpecEntries,
  hunkRangesFromDiff,
  orderSpecUnion,
  toBlastSnapshot,
  toIntentSnapshot,
} from '../src/modules/brief/helpers.js';

const row = (name: string, docs: string[], skills: string[][] = []) => ({ agentId: name, name, docs, skills });

describe('orderSpecUnion', () => {
  it('walks agents in the given (name asc) order: agent docs, then bound skills in bind order, first wins (AC-15)', () => {
    const out = orderSpecUnion([
      row('a', ['specs/1.md', 'specs/2.md'], [['specs/3.md', 'specs/1.md'], ['specs/4.md']]),
      row('b', ['specs/4.md', 'specs/5.md'], [['specs/2.md', 'specs/6.md']]),
    ]);
    expect(out).toEqual(['specs/1.md', 'specs/2.md', 'specs/3.md', 'specs/4.md', 'specs/5.md', 'specs/6.md']);
  });

  it('is empty with no attachments', () => {
    expect(orderSpecUnion([row('a', [], [[]])])).toEqual([]);
  });
});

const diff = parseUnifiedDiff(
  [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +10,3 @@ fn',
    ' ctx',
    '-gone',
    '+new',
    '@@ -30,2 +33,0 @@',
    '-deleted-only',
    '-deleted-too',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -5,2 +5,0 @@',
    '-x',
    '-y',
  ].join('\n'),
);

describe('hunkRangesFromDiff / fileFacts', () => {
  it('skips pure-deletion hunks; a deletions-only file has no ranges (D6, AC-22)', () => {
    const r = hunkRangesFromDiff(diff);
    expect(r.get('src/a.ts')).toEqual([{ start: 10, count: 3 }]);
    expect(r.get('src/b.ts')).toEqual([]);
  });

  it('takes the file list and stats from pr_files and ranges from the diff; falls back to the diff', () => {
    const facts = fileFacts([{ path: 'src/a.ts', additions: 4, deletions: 2 }], diff);
    expect(facts).toEqual([{ path: 'src/a.ts', additions: 4, deletions: 2, ranges: [{ start: 10, count: 3 }] }]);
    expect(fileFacts([], diff).map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(fileFacts([], null)).toEqual([]);
  });

  it('never exposes patch text', () => {
    expect(JSON.stringify(fileFacts([], diff))).not.toContain('deleted-only');
  });
});

describe('snapshots', () => {
  it('intent drops record metadata', () => {
    const rec = {
      summary: 's', in_scope: [], out_of_scope: [], risk_areas: [], missing_context: [], confidence: 'high',
      pr_id: 'p', head_sha: 'x', sources: [], model: 'm', tokens_in: 1, tokens_out: 1, cost_usd: 0,
      diff_tokens_saved: 0, computed_at: 'now',
    } as PrIntentRecord;
    expect(Object.keys(toIntentSnapshot(rec)).sort()).toEqual(
      ['confidence', 'in_scope', 'missing_context', 'out_of_scope', 'risk_areas', 'summary'],
    );
  });

  it('blast drops truncated/counts and flattens callers', () => {
    const b = {
      changed_symbols: [{ name: 'f', file: 'a.ts', kind: 'function' }],
      downstream: [
        { symbol: 'f', callers: [{ name: 'g', file: 'b.ts', line: 3 }], endpoints_affected: [], crons_affected: [], truncated: true },
      ],
      summary: 'sum',
      counts: { symbols: 1, callers: 1, endpoints: 0, crons: 0 },
      degraded: false,
    } as unknown as PrBlastResponse;
    expect(toBlastSnapshot(b).downstream[0]).not.toHaveProperty('truncated');
    expect(callersFromBlast(b)).toEqual([{ name: 'g', file: 'b.ts', line: 3 }]);
  });
});

describe('finalizeSpecEntries / briefLogPayload', () => {
  it('re-counted tokens for used specs, over_budget for the rest, skipped untouched', () => {
    const out = finalizeSpecEntries(
      [
        { path: 'a.md', status: 'used', reason: null, tokens: 9 },
        { path: 'b.md', status: 'used', reason: null, tokens: 9 },
        { path: 'c.md', status: 'skipped', reason: 'not_found', tokens: null },
      ],
      [{ path: 'a.md', tokens: 7 }],
      ['b.md'],
    );
    expect(out).toEqual([
      { path: 'a.md', status: 'used', reason: null, tokens: 7 },
      { path: 'b.md', status: 'skipped', reason: 'over_budget', tokens: null },
      { path: 'c.md', status: 'skipped', reason: 'not_found', tokens: null },
    ]);
  });

  it('log payload has no free text fields', () => {
    const p = briefLogPayload({ outcome: 'timeout', prId: 'p', provider: 'openai', model: 'm', missing: [{ input: 'intent', reason: 'not derived yet' }], ms: 5 });
    expect(p).toMatchObject({ event: 'brief.generated', outcome: 'timeout', pr_id: 'p' });
  });
});
