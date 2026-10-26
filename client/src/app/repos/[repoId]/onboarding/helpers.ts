/* Pure helpers for the Onboarding Tour page (no React, no i18n lookups). */
import type {
  OnboardingIndexSummary,
  OnboardingLlmUsage,
  OnboardingSection,
  OnboardingSkeletonReason,
  OnboardingTour,
} from "@devdigest/shared";
import { githubBlobUrl } from "../../../../lib/github-urls";
import { ANNOTATION_MAX } from "./constants";

export interface SubtitleParts {
  indexed: number;
  /** null when the source-file total is unknown (AC-9). */
  total: number | null;
}

export function subtitleParts(tour: OnboardingTour): SubtitleParts {
  return { indexed: tour.index.files_indexed, total: tour.index.source_files_total };
}

export interface StatsParts {
  calls: number;
  /** Only set when more than one attempt was made (AC-13). */
  attempts: number | null;
  /** tokens_in + tokens_out; null for a skeleton or when unknown. */
  tokens: number | null;
  /** Four-decimal dollar amount without "$"; null = show "cost unknown". */
  cost: string | null;
  model: string | null;
  /** True when only the call count is shown (skeleton, AC-11). */
  callsOnly: boolean;
}

export function statsParts(llm: OnboardingLlmUsage, mode: OnboardingTour["mode"]): StatsParts {
  if (mode === "skeleton" || llm.calls === 0) {
    return { calls: 0, attempts: null, tokens: null, cost: null, model: null, callsOnly: true };
  }
  const tokens = llm.tokens_in != null && llm.tokens_out != null ? llm.tokens_in + llm.tokens_out : null;
  return {
    calls: llm.calls,
    attempts: llm.attempts != null && llm.attempts > 1 ? llm.attempts : null,
    tokens,
    cost: llm.cost_usd == null ? null : llm.cost_usd.toFixed(4),
    model: llm.model,
    callsOnly: false,
  };
}

/** "top {max(1, 100 − percentile)}%" (AC-51). */
export function topPercent(percentile: number): number {
  return Math.max(1, 100 - percentile);
}

/** Shorten a long path in the middle, keeping the start and the file name. */
export function middleTruncate(path: string, max: number): string {
  if (path.length <= max) return path;
  const keep = max - 1;
  const tail = Math.ceil(keep / 2);
  const head = keep - tail;
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

/** One line, no control characters, at most ANNOTATION_MAX characters (AC-59). */
export function sanitizeAnnotation(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > ANNOTATION_MAX ? `${clean.slice(0, ANNOTATION_MAX - 1)}…` : clean;
}

/** i18n key (under the `onboarding` namespace) of a skeleton reason's text group. */
export function skeletonCopyKey(reason: OnboardingSkeletonReason): `skeleton.reasons.${OnboardingSkeletonReason}` {
  return `skeleton.reasons.${reason}`;
}

export type UnavailableKey =
  | "unavailable.firstTasksSkeleton"
  | "unavailable.firstTasksTooFew"
  | "unavailable.indexUnavailable"
  | "unavailable.noClone";

/**
 * Known unavailable states are rendered from client i18n (NFR-7); null means
 * "unknown state" and the caller falls back to the stored `unavailable_reason`.
 */
export function unavailableCopyKey(section: OnboardingSection, tour: OnboardingTour): UnavailableKey | null {
  if (section.available) return null;
  if (section.kind === "first_tasks") {
    return tour.mode === "skeleton" ? "unavailable.firstTasksSkeleton" : "unavailable.firstTasksTooFew";
  }
  if ((section.kind === "critical_paths" || section.kind === "reading_path") && tour.skeleton_reason === "index_unavailable") {
    return "unavailable.indexUnavailable";
  }
  if (section.kind === "run_locally" && tour.skeleton_reason === "no_clone") return "unavailable.noClone";
  return null;
}

/** GitHub blob URL at the tour's indexed SHA, else the default branch (AC-57). */
export function openFileUrl(
  repoFullName: string,
  sha: string | null,
  defaultBranch: string | null | undefined,
  path: string,
): string {
  return githubBlobUrl(repoFullName, sha ?? defaultBranch ?? "HEAD", path);
}

/** Stale marker: the index moved on since the tour was generated (AC-20). */
export function isStale(current: OnboardingIndexSummary, tour: OnboardingTour): boolean {
  return current.last_indexed_sha !== tour.index.last_indexed_sha;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 hours ago" style label for `last refreshed` / `Showing the tour from`. */
export function relativeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return fmt.format(-Math.floor(seconds / size), unit);
  }
  return fmt.format(0, "second");
}
