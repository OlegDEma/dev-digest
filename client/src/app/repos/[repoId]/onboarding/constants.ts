import type { OnboardingSectionKind } from "@devdigest/shared";

/** Section order of a tour; the server guarantees the same order (OnboardingTour refinement). */
export const SECTION_ORDER: readonly OnboardingSectionKind[] = [
  "architecture_overview",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
];

export const ANNOTATION_MAX = 80;
export const PATH_TRUNCATE_AT = 56;

/** DOM id of a section's heading (TOC scroll + focus target). */
export const sectionAnchor = (kind: OnboardingSectionKind) => `onboarding-section-${kind}`;

/** Error code the server answers a concurrent generate with (C2). */
export const GENERATION_IN_PROGRESS = "generation_in_progress";
