/** Shared display formatters (framework-agnostic, no i18n). */

/**
 * USD cost for the UI.
 *
 * Rules (Run Cost Badge spec §5):
 *  - `null` / `undefined` (unknown / failed / never-run) → em dash, never "$0.00".
 *  - a genuine `0` (free model reporting `usage.cost = 0`) → "$0.00" (truthful).
 *  - otherwise 3 significant figures with trailing zeros trimmed, so sub-cent
 *    costs stay visible: 0.0013→"$0.0013", 0.012→"$0.012", 0.06→"$0.06".
 *    Never collapses a real cost to "$0.01".
 */
export function formatCostUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  return `$${Number(n.toPrecision(3))}`;
}
