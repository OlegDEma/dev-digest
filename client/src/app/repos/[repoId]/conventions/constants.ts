import type { ConventionCandidate } from "@devdigest/shared";

/** Triage views. "all" is first so the board opens showing everything. */
export const FILTERS = ["all", "pending", "accepted", "rejected"] as const;
export type FilterKey = (typeof FILTERS)[number];

export const CATEGORY_VALUES: ConventionCandidate["category"][] = [
  "naming",
  "imports",
  "error-handling",
  "testing",
  "structure",
  "typing",
  "async",
  "styling",
];

/** Confidence bands — the same 85/65 split the shared ConfidenceNum dot uses. */
export const CONFIDENCE_BANDS = [
  { min: 0.85, color: "var(--ok)" },
  { min: 0.65, color: "var(--warn)" },
  { min: 0, color: "var(--crit)" },
] as const;

/** Status → the accent stripe down the left of a card. */
export const STATUS_COLOR: Record<ConventionCandidate["status"], string> = {
  pending: "var(--border-strong)",
  accepted: "var(--ok)",
  rejected: "var(--crit)",
};
