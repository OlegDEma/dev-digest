/* PrBriefSection helpers — pure formatting. */
import type { BriefMissingInput, BriefSpecEntry } from "@devdigest/shared";

export const SUMMARY_MAX_CHARS = 800;

export function truncateSummary(text: string, max = SUMMARY_MAX_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatCost(usd: number | null, unknown: string): string {
  return usd == null ? unknown : `$${usd.toFixed(4)}`;
}

export interface MissingLine {
  key: string;
  kind: "input" | "spec";
  input?: BriefMissingInput["input"];
  path?: string;
  reason?: NonNullable<BriefSpecEntry["reason"]>;
}

/** Inputs that were unavailable plus spec documents that were skipped, in display order. */
export function missingLines(missing: BriefMissingInput[], specs: BriefSpecEntry[]): MissingLine[] {
  const inputs = missing.map<MissingLine>((m) => ({ key: `input:${m.input}`, kind: "input", input: m.input }));
  const skipped = specs
    .filter((x) => x.status === "skipped" && x.reason)
    .map<MissingLine>((x) => ({ key: `spec:${x.path}`, kind: "spec", path: x.path, reason: x.reason! }));
  return [...inputs, ...skipped];
}

export function droppedTotal(d: { risks: number; risk_refs: number; review_focus: number }): number {
  return d.risks + d.risk_refs + d.review_focus;
}
