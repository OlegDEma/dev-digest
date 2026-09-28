/** Shared display formatters (framework-agnostic, no i18n). */

/**
 * USD cost for the UI, as a FIXED-decimal dollar string so a column of costs
 * lines up and sums by eye (per-agent runs → the PR total). `null`/`undefined`
 * (unknown / failed / never-run) → em dash, never a number.
 *
 * Why fixed 6 decimals, not significant figures: review costs are sub-cent and
 * often micro-dollar, so a variable-precision format (e.g. `toPrecision(3)`)
 * renders $0.0000246 and $0.000252 — a 10× difference — with a different number
 * of decimals, making them look alike and impossible to add. Six fixed places
 * keep micro-dollar costs visible ($0.000025) and aligned, without ever
 * collapsing a real cost to "$0.00".
 */
export function formatCostUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(6)}`;
}

/**
 * Rough token count for a prompt segment: `ceil(chars / 4)`, the same fallback
 * heuristic the server's tokenizer adapter uses when the BPE encoder is
 * unavailable. The client has no tokenizer, so callers must present this with a
 * `~` — it is a size hint for skill bodies and trace blocks, not a bill.
 */
export function approxTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Compact token count for chips: 830 → "830", 12_400 → "12.4k". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}k`;
}
