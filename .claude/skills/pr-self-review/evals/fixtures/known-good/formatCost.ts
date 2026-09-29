// FIXTURE (eval id 5, known-good) — clean, pure, well-typed. Expected: PASS.
// NOT part of the app build. A reviewer should invent nothing here.

/** Format a USD cost (contract field `cost_usd`) for display, e.g. 0.0421 → "$0.04". */
export function formatCost(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd < 0) return "—";
  return `$${costUsd.toFixed(2)}`;
}
