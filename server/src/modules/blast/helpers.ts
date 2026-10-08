import type { BlastCounts, BlastDegradedReason, DownstreamImpact, PrBlastResponse } from '@devdigest/shared';
import type { BlastResult, DegradedReason, IndexState } from '../repo-intel/types.js';
import { TEST_PATH_PATTERNS } from '../repo-intel/constants.js';

// tsc fails here when repo-intel's DegradedReason and the contract enum drift apart.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _reasonInSync: Equal<DegradedReason, BlastDegradedReason> = true;
void _reasonInSync;

export interface BlastMeta {
  degraded: boolean;
  reason: BlastDegradedReason | null;
  indexSha: string | null;
  maxCallers: number;
}

/** Facade result + index state -> degraded flag and reason. `partial` is a working but incomplete index. */
export function blastStatus(
  result: BlastResult,
  state: Pick<IndexState, 'status'>,
): { degraded: boolean; reason: BlastDegradedReason | null } {
  if (result.degraded) return { degraded: true, reason: result.reason ?? 'no_data' };
  if (state.status === 'partial') return { degraded: true, reason: 'index_partial' };
  return { degraded: false, reason: null };
}

export function buildSummary(c: BlastCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const symbols = plural(c.symbols, 'changed symbol', 'changed symbols');
  if (c.callers === 0) return `${symbols}, no downstream callers found.`;
  return [
    symbols,
    plural(c.callers, 'caller', 'callers'),
    plural(c.endpoints, 'endpoint', 'endpoints'),
    plural(c.crons, 'cron', 'crons'),
  ].join(' · ');
}

/** True for test files; repo paths are stored relative, so a root `test/x.ts` is checked as `/test/x.ts`. */
export function isTestPath(path: string): boolean {
  const lower = `/${path.toLowerCase()}`;
  return TEST_PATH_PATTERNS.some((p) => lower.includes(p));
}

const EMPTY_FACTS = { endpoints: [] as string[], crons: [] as string[] };

const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

/** Flat facade rows -> per-symbol groups (server orders, clients render). */
export function toPrBlastResponse(result: BlastResult, meta: BlastMeta): PrBlastResponse {
  const declFiles = new Map<string, Set<string>>();
  const names: string[] = [];
  for (const s of result.changedSymbols) {
    if (!declFiles.has(s.name)) {
      declFiles.set(s.name, new Set());
      names.push(s.name);
    }
    declFiles.get(s.name)!.add(s.file);
  }

  const bySymbol = new Map<string, { name: string; file: string; line: number; rank: number }[]>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    const list = bySymbol.get(c.viaSymbol) ?? [];
    if (list.length >= meta.maxCallers) continue;
    list.push({ name: c.symbol, file: c.file, line: c.line, rank: c.rank });
    bySymbol.set(c.viaSymbol, list);
  }

  const factsOf = (file: string) => (isTestPath(file) ? EMPTY_FACTS : (result.factsByFile?.[file] ?? EMPTY_FACTS));
  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  const callerFiles = new Set<string>();

  const groups = names.map((symbol) => {
    const rows = bySymbol.get(symbol) ?? []; // already rank-desc from the facade
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const r of rows) {
      callerFiles.add(r.file);
      for (const e of factsOf(r.file).endpoints) endpoints.add(e);
      for (const c of factsOf(r.file).crons) crons.add(c);
    }
    endpoints.forEach((e) => allEndpoints.add(e));
    crons.forEach((c) => allCrons.add(c));
    const impact: DownstreamImpact = {
      symbol,
      callers: rows.map(({ name, file, line }) => ({ name, file, line })),
      endpoints_affected: uniqSorted(endpoints),
      crons_affected: uniqSorted(crons),
    };
    return { impact, best: rows.length ? Math.max(...rows.map((r) => r.rank)) : -1 };
  });

  groups.sort((a, b) => {
    const az = a.impact.callers.length === 0;
    const bz = b.impact.callers.length === 0;
    if (az !== bz) return az ? 1 : -1;
    if (!az && a.best !== b.best) return b.best - a.best;
    if (a.impact.callers.length !== b.impact.callers.length) {
      return b.impact.callers.length - a.impact.callers.length;
    }
    return a.impact.symbol.localeCompare(b.impact.symbol);
  });

  const facts_by_file: PrBlastResponse['facts_by_file'] = {};
  for (const f of [...callerFiles].sort()) {
    const facts = factsOf(f);
    facts_by_file[f] = { endpoints: [...facts.endpoints], crons: [...facts.crons] };
  }

  const counts: BlastCounts = {
    symbols: names.length,
    callers: groups.reduce((n, g) => n + g.impact.callers.length, 0),
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  };

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: groups.map((g) => g.impact),
    summary: buildSummary(counts),
    counts,
    degraded: meta.degraded,
    reason: meta.reason,
    index_sha: meta.indexSha,
    max_callers_per_symbol: meta.maxCallers,
    facts_by_file,
  };
}
