import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_BANDS, type FilterKey } from "./constants";

/** Pure view logic for the Conventions board — unit-tested in helpers.test.ts. */

export function filterCandidates(
  candidates: ConventionCandidate[],
  filter: FilterKey,
): ConventionCandidate[] {
  if (filter === "all") return candidates;
  return candidates.filter((c) => c.status === filter);
}

export function countByStatus(candidates: ConventionCandidate[]): Record<FilterKey, number> {
  return {
    all: candidates.length,
    pending: candidates.filter((c) => c.status === "pending").length,
    accepted: candidates.filter((c) => c.status === "accepted").length,
    rejected: candidates.filter((c) => c.status === "rejected").length,
  };
}

export function confidenceColor(confidence: number): string {
  return (CONFIDENCE_BANDS.find((b) => confidence >= b.min) ?? CONFIDENCE_BANDS[2]!).color;
}

export function confidencePct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/**
 * Deep-link evidence to the exact line on GitHub. Returns null when we lack the
 * pieces rather than emitting a broken link.
 */
export function evidenceUrl(
  repoFullName: string | null | undefined,
  branch: string | null | undefined,
  path: string,
  line: number | null | undefined,
): string | null {
  if (!repoFullName || !path) return null;
  const ref = branch || "HEAD";
  return `https://github.com/${repoFullName}/blob/${ref}/${path}${line ? `#L${line}` : ""}`;
}

/** `path:line`, or just the path when the line is unknown. */
export function evidenceLabel(path: string, line: number | null | undefined): string {
  return line ? `${path}:${line}` : path;
}
