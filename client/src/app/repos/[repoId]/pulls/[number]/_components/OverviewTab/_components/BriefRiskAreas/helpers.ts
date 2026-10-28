/* BriefRiskAreas helpers — pure ref parsing and severity styling. */
import type { RiskSeverity } from "@devdigest/shared";

const REF = /^(.+?):(\d+)(?:-(\d+))?$/;

/** "src/a.ts:10-20" → { path, line: 10 }; a bare path → { path, line: null }. */
export function parseRef(ref: string): { path: string; line: number | null } {
  const m = REF.exec(ref);
  if (!m) return { path: ref, line: null };
  const line = Number(m[2]!);
  return { path: m[1]!, line: line >= 1 ? line : null };
}

export function severityColor(sev: RiskSeverity): string {
  return sev === "high" ? "var(--crit)" : sev === "medium" ? "var(--warn)" : "var(--text-muted)";
}
