import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Spec 12 — facade index-only option (`fallback:false`) and the per-symbol caller cap.
 * No Postgres: the service's repository is patched; `codeIndex` spies must never fire.
 */

function build(opts: { flag: boolean; state?: Partial<IndexState> | null; callerRows?: unknown[] }) {
  const symbolsSpy = vi.fn(async () => []);
  const referencesSpy = vi.fn(async () => []);
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: { symbols: symbolsSpy, references: referencesSpy } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => (opts.state ? { repoId: 'r1', ...opts.state } : null),
    getRepoBasics: async () => null,
    getSymbolRows: async (_r: string, paths: string[]) =>
      paths.includes('decl.ts')
        ? [
            { path: 'decl.ts', name: 'a', kind: 'function', line: 1, endLine: 2, exported: true, signature: null },
            { path: 'decl.ts', name: 'b', kind: 'function', line: 3, endLine: 4, exported: true, signature: null },
          ]
        : [],
    getResolvedCallers: async () => opts.callerRows ?? [],
    getFileFacts: async () => [],
  };
  return { svc, symbolsSpy, referencesSpy };
}

describe('RepoIntel.getBlastRadius — index only + per-symbol cap', () => {
  it('caps callers per viaSymbol and keeps rank order', async () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => ({ fromPath: `a${i}.ts`, toSymbol: 'a', line: 1, rank: 100 - i })),
      ...Array.from({ length: 3 }, (_, i) => ({ fromPath: `b${i}.ts`, toSymbol: 'b', line: 1, rank: 50 - i })),
    ];
    const { svc, symbolsSpy, referencesSpy } = build({ flag: true, state: { status: 'full' }, callerRows: rows });
    const res = await svc.getBlastRadius('r1', ['decl.ts'], { fallback: false });
    expect(res.degraded).toBe(false);
    expect(res.callers.filter((c) => c.viaSymbol === 'a')).toHaveLength(20);
    expect(res.callers.filter((c) => c.viaSymbol === 'b')).toHaveLength(3);
    expect(res.truncatedSymbols).toEqual(['a']);
    const ranks = res.callers.map((c) => c.rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => y - x));
    expect(symbolsSpy).not.toHaveBeenCalled();
    expect(referencesSpy).not.toHaveBeenCalled();
  });

  it('flag off -> flag_off, no codeIndex', async () => {
    const { svc, symbolsSpy, referencesSpy } = build({ flag: false });
    const res = await svc.getBlastRadius('r1', ['decl.ts'], { fallback: false });
    expect(res).toMatchObject({ degraded: true, reason: 'flag_off', callers: [] });
    expect(symbolsSpy).not.toHaveBeenCalled();
    expect(referencesSpy).not.toHaveBeenCalled();
  });

  it('no index row -> no_data, no codeIndex', async () => {
    const { svc, symbolsSpy, referencesSpy } = build({ flag: true, state: null });
    const res = await svc.getBlastRadius('r1', ['decl.ts'], { fallback: false });
    expect(res).toMatchObject({ degraded: true, reason: 'no_data' });
    expect(symbolsSpy).not.toHaveBeenCalled();
    expect(referencesSpy).not.toHaveBeenCalled();
  });

  it('failed row -> index_failed, no codeIndex', async () => {
    const { svc, symbolsSpy, referencesSpy } = build({
      flag: true,
      state: { status: 'failed', degraded: true, degradedReason: 'index_failed' },
    });
    const res = await svc.getBlastRadius('r1', ['decl.ts'], { fallback: false });
    expect(res).toMatchObject({ degraded: true, reason: 'index_failed' });
    expect(symbolsSpy).not.toHaveBeenCalled();
    expect(referencesSpy).not.toHaveBeenCalled();
  });
});
