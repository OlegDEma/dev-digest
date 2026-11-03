/** Newest rows shown (the API already caps at 100). */
export const RUN_LIMIT = 100;

/** CiRunStatus → key under `ci.runs.status`. */
export const STATUS_KEY: Record<string, string> = {
  succeeded: "succeeded",
  no_findings: "noFindings",
  failed: "failed",
  running: "running",
};

export function formatRanAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function formatCost(usd: number | null): string {
  return usd == null ? "—" : `$${usd.toFixed(4)}`;
}

export function safeHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
