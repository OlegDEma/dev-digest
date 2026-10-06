/* IntentCard helpers — pure formatting. */

export function confidenceColor(c: "high" | "medium" | "low"): string {
  return c === "high" ? "var(--ok)" : c === "medium" ? "var(--warn)" : "var(--crit)";
}

export function formatCost(usd: number | null): string {
  return usd == null ? "—" : `$${usd.toFixed(4)}`;
}
