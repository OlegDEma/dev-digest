import type {
  BlastRadius,
  BriefMissingInput,
  BriefSpecEntry,
  Intent,
  PrBlastResponse,
  PrBrief,
  PrIntentRecord,
  UnifiedDiff,
} from '@devdigest/shared';
import type { BriefFacts, BriefRange, GenerateBriefResult } from '@devdigest/reviewer-core';
import { BRIEF_INPUT_BUDGET_TOKENS } from './constants.js';
import type { SpecAttachmentRow } from './repository.js';

/** Every agent (name asc) → its docs, then its enabled bound skills' docs in bind order; first occurrence wins. */
export function orderSpecUnion(rows: readonly SpecAttachmentRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const list of [row.docs, ...row.skills]) {
      for (const p of list) {
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

/** New-side hunk ranges per file. Pure deletions (`newLines === 0`) carry no new-side line, so they are skipped. */
export function hunkRangesFromDiff(diff: UnifiedDiff | null): Map<string, BriefRange[]> {
  const out = new Map<string, BriefRange[]>();
  for (const f of diff?.files ?? []) {
    out.set(
      f.path,
      f.hunks.filter((h) => h.newLines > 0).map((h) => ({ start: h.newStart, count: h.newLines })),
    );
  }
  return out;
}

/** File list from `pr_files`, else from the diff; ranges always from the diff. Patch text never enters. */
export function fileFacts(
  prFiles: readonly { path: string; additions: number; deletions: number }[],
  diff: UnifiedDiff | null,
): BriefFacts['files'] {
  const ranges = hunkRangesFromDiff(diff);
  const base = prFiles.length > 0 ? prFiles : (diff?.files ?? []);
  return base.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    ranges: ranges.get(f.path) ?? [],
  }));
}

export function toIntentSnapshot(r: PrIntentRecord): Intent {
  return {
    summary: r.summary,
    in_scope: r.in_scope,
    out_of_scope: r.out_of_scope,
    risk_areas: r.risk_areas,
    missing_context: r.missing_context,
    confidence: r.confidence,
  };
}

export function toBlastSnapshot(b: PrBlastResponse): BlastRadius {
  return {
    changed_symbols: b.changed_symbols,
    downstream: b.downstream.map((d) => ({
      symbol: d.symbol,
      callers: d.callers,
      endpoints_affected: d.endpoints_affected,
      crons_affected: d.crons_affected,
    })),
    summary: b.summary,
  };
}

export function callersFromBlast(b: PrBlastResponse): { name: string; file: string; line: number }[] {
  return b.downstream.flatMap((d) => d.callers.map((c) => ({ name: c.name, file: c.file, line: c.line })));
}

/** Specs the engine actually sent keep their re-counted tokens; the rest become `over_budget`. */
export function finalizeSpecEntries(
  entries: readonly BriefSpecEntry[],
  used: readonly { path: string; tokens: number }[],
  overBudget: readonly string[],
): BriefSpecEntry[] {
  const tokens = new Map(used.map((u) => [u.path, u.tokens]));
  const over = new Set(overBudget);
  return entries.map((e) => {
    if (e.status !== 'used') return e;
    if (over.has(e.path)) return { path: e.path, status: 'skipped', reason: 'over_budget', tokens: null };
    return { ...e, tokens: tokens.get(e.path) ?? e.tokens };
  });
}

export interface StoredBriefInput {
  result: GenerateBriefResult;
  provider: string;
  headSha: string;
  intent: Intent | null;
  blast: BlastRadius | null;
  missing: BriefMissingInput[];
  specs: BriefSpecEntry[];
  now?: Date;
}

export function toStoredBrief(i: StoredBriefInput): PrBrief {
  const r = i.result;
  return {
    intent: i.intent,
    blast: i.blast,
    risks: { risks: r.risks },
    history: null,
    summary: r.summary,
    review_focus: r.review_focus,
    head_sha: i.headSha,
    generated_at: (i.now ?? new Date()).toISOString(),
    provider: i.provider,
    model: r.model,
    calls: 1,
    attempts: Math.max(1, r.attempts),
    input_tokens: r.inputTokens,
    input_budget: BRIEF_INPUT_BUDGET_TOKENS,
    tokens_in: r.tokensIn,
    tokens_out: r.tokensOut,
    cost_usd: r.costUsd,
    missing_inputs: i.missing,
    specs: finalizeSpecEntries(i.specs, r.specsUsed, r.specsOverBudget),
    reductions: r.reductions,
    dropped: r.dropped,
    corrected_lines: r.corrected_lines,
  };
}

export type BriefOutcome = 'ok' | 'config_error' | 'external_service_error' | 'timeout';

export interface BriefLogInput {
  outcome: BriefOutcome;
  prId: string;
  provider?: string;
  model?: string;
  missing?: readonly BriefMissingInput[];
  /** Per input section token counts; known once the prompt was assembled. */
  sectionTokens?: readonly { name: string; tokens: number }[];
  /** True once the single model call was issued. */
  called?: boolean;
  /** Accounting of a failed call (StructuredOutputError), when the provider reported it. */
  failure?: { attempts: number; tokensOut: number; costUsd: number | null };
  brief?: PrBrief;
  ms: number;
}

/** Content-free: ids, counts, input names + reasons. Never summary, risk text, spec text or paths. Unknown values are null. */
export function briefLogPayload(i: BriefLogInput): Record<string, unknown> {
  const b = i.brief;
  const f = i.failure;
  return {
    event: 'brief.generated',
    outcome: i.outcome,
    pr_id: i.prId,
    provider: i.provider ?? null,
    model: i.model ?? null,
    calls: b ? b.calls : i.called ? 1 : 0,
    attempts: b ? b.attempts : (f?.attempts ?? null),
    input_tokens: i.sectionTokens ? Object.fromEntries(i.sectionTokens.map((s) => [s.name, s.tokens])) : null,
    input_tokens_total: b ? b.input_tokens : (i.sectionTokens?.reduce((n, s) => n + s.tokens, 0) ?? null),
    input_budget: BRIEF_INPUT_BUDGET_TOKENS,
    tokens_out: b ? b.tokens_out : (f?.tokensOut ?? null),
    cost_usd: b ? b.cost_usd : (f?.costUsd ?? null),
    dropped: b ? b.dropped : null,
    corrected_lines: b ? b.corrected_lines : null,
    missing_inputs: (i.missing ?? []).map((m) => ({ input: m.input, reason: m.reason })),
    ms: i.ms,
  };
}
