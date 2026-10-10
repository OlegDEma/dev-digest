import { describe, it, expect } from 'vitest';
import { blastStatus, buildSummary, isTestPath, toPrBlastResponse } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const meta = { degraded: false, reason: null, indexSha: 'abc', maxCallers: 2 } as const;

const caller = (file: string, viaSymbol: string, rank: number, symbol = 'fn', line = 1) => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank,
});

const base: BlastResult = {
  changedSymbols: [
    { file: 'decl.ts', name: 'a', kind: 'function' },
    { file: 'decl.ts', name: 'b', kind: 'function' },
    { file: 'decl.ts', name: 'z', kind: 'function' },
  ],
  callers: [
    caller('decl.ts', 'a', 99), // same-file guard
    caller('r1.ts', 'a', 9),
    caller('r2.ts', 'a', 8),
    caller('r3.ts', 'a', 7), // over the cap of 2
    caller('r4.ts', 'b', 5),
  ],
  impactedEndpoints: [],
  factsByFile: {
    'r1.ts': { endpoints: ['GET /x', 'GET /a'], crons: ['c1'] },
    'r2.ts': { endpoints: ['GET /x'], crons: [] },
    'r3.ts': { endpoints: ['GET /dropped'], crons: [] },
    'r4.ts': { endpoints: [], crons: [] },
    'unrelated.ts': { endpoints: ['GET /nope'], crons: [] },
  },
};

describe('toPrBlastResponse', () => {
  const res = toPrBlastResponse(base, meta);

  it('groups, caps per symbol, drops declaring-file callers', () => {
    const a = res.downstream.find((g) => g.symbol === 'a')!;
    expect(a.callers.map((c) => c.file)).toEqual(['r1.ts', 'r2.ts']);
  });

  it('marks a group truncated only when callers were cut', () => {
    expect(res.downstream.find((g) => g.symbol === 'a')!.truncated).toBe(true);
    expect(res.downstream.find((g) => g.symbol === 'b')!.truncated).toBe(false);
    const facade = toPrBlastResponse({ ...base, callers: [caller('r1.ts', 'b', 5)], truncatedSymbols: ['b'] }, meta);
    expect(facade.downstream.find((g) => g.symbol === 'b')!.truncated).toBe(true);
  });

  it('lists zero-caller symbols last', () => {
    expect(res.downstream.map((g) => g.symbol)).toEqual(['a', 'b', 'z']);
    expect(res.downstream[2]!.callers).toEqual([]);
  });

  it('unions and sorts endpoints/crons per group', () => {
    const a = res.downstream[0]!;
    expect(a.endpoints_affected).toEqual(['GET /a', 'GET /x']);
    expect(a.crons_affected).toEqual(['c1']);
  });

  it('restricts facts_by_file to present callers', () => {
    expect(Object.keys(res.facts_by_file).sort()).toEqual(['r1.ts', 'r2.ts', 'r4.ts']);
  });

  it('counts unique names and union sizes', () => {
    expect(res.counts).toEqual({ symbols: 3, callers: 3, endpoints: 2, crons: 1 });
    expect(res.summary).toBe('3 changed symbols · 3 callers · 2 endpoints · 1 cron');
  });

  it('orders by best caller rank, then caller count, then name', () => {
    const r = toPrBlastResponse(
      {
        changedSymbols: [
          { file: 'd.ts', name: 'low', kind: 'function' },
          { file: 'd.ts', name: 'high', kind: 'function' },
        ],
        callers: [caller('x.ts', 'high', 10), caller('y.ts', 'low', 1)],
        impactedEndpoints: [],
      },
      meta,
    );
    expect(r.downstream.map((g) => g.symbol)).toEqual(['high', 'low']);
  });

  it('merges same-name symbols from two files into one row', () => {
    const r = toPrBlastResponse(
      {
        changedSymbols: [
          { file: 'd1.ts', name: 'dup', kind: 'function' },
          { file: 'd2.ts', name: 'dup', kind: 'function' },
        ],
        callers: [],
        impactedEndpoints: [],
      },
      meta,
    );
    expect(r.counts.symbols).toBe(1);
    expect(r.changed_symbols).toHaveLength(2);
  });

  it('passes meta through', () => {
    expect(res).toMatchObject({ degraded: false, reason: null, index_sha: 'abc', max_callers_per_symbol: 2 });
  });
});

describe('buildSummary', () => {
  it('no-callers branch', () => {
    expect(buildSummary({ symbols: 2, callers: 0, endpoints: 0, crons: 0 })).toBe(
      '2 changed symbols, no downstream callers found.',
    );
  });
  it('singular forms', () => {
    expect(buildSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 })).toBe(
      '1 changed symbol · 1 caller · 1 endpoint · 1 cron',
    );
  });
});

describe('blastStatus', () => {
  const ok: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
  it.each(['flag_off', 'index_failed', 'no_data'] as const)('passes %s through', (reason) => {
    expect(blastStatus({ ...ok, degraded: true, reason }, { status: 'degraded' })).toEqual({
      degraded: true,
      reason,
    });
  });
  it('degraded without reason -> no_data', () => {
    expect(blastStatus({ ...ok, degraded: true }, { status: 'degraded' }).reason).toBe('no_data');
  });
  it('partial -> index_partial', () => {
    expect(blastStatus(ok, { status: 'partial' })).toEqual({ degraded: true, reason: 'index_partial' });
  });
  it('full -> not degraded', () => {
    expect(blastStatus(ok, { status: 'full' })).toEqual({ degraded: false, reason: null });
  });
});

describe('test-file facts (spec 12 D24)', () => {
  const res = toPrBlastResponse(
    {
      changedSymbols: [{ file: 'decl.ts', name: 'a', kind: 'function' }],
      callers: [caller('server/test/agents.test.ts', 'a', 9), caller('src/real.ts', 'a', 5)],
      impactedEndpoints: [],
      factsByFile: {
        'server/test/agents.test.ts': { endpoints: ['GET /agents/${agentId}/versions/99'], crons: ['t'] },
        'src/real.ts': { endpoints: ['GET /real'], crons: [] },
      },
    },
    { degraded: false, reason: null, indexSha: null, maxCallers: 5 },
  );

  it('keeps the test caller but drops its endpoints and crons', () => {
    const g = res.downstream[0]!;
    expect(g.callers.map((c) => c.file)).toEqual(['server/test/agents.test.ts', 'src/real.ts']);
    expect(g.endpoints_affected).toEqual(['GET /real']);
    expect(g.crons_affected).toEqual([]);
    expect(res.facts_by_file['server/test/agents.test.ts']).toEqual({ endpoints: [], crons: [] });
    expect(res.counts).toMatchObject({ callers: 2, endpoints: 1, crons: 0 });
  });

  it('isTestPath', () => {
    for (const p of ['a.spec.ts', '__tests__/x.ts', 'test/x.ts', 'src/tests/y.ts']) expect(isTestPath(p)).toBe(true);
    expect(isTestPath('src/attest.ts')).toBe(false);
  });
});
