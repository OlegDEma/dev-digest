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
