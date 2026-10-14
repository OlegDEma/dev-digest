/* Shared test fixtures + render helper for the Onboarding Tour page tests. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  OnboardingIndexSummary,
  OnboardingSection,
  OnboardingTour,
  OnboardingTourResponse,
} from "@devdigest/shared";
import messages from "../../../../../messages/en/onboarding.json";

export function renderIntl(ui: React.ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export const indexSummary = (over: Partial<OnboardingIndexSummary> = {}): OnboardingIndexSummary => ({
  status: "full",
  files_indexed: 5000,
  source_files_total: 12450,
  files_bounded: 7450,
  files_skipped: 0,
  last_indexed_sha: "abc123",
  hotness_available: false,
  clone_available: true,
  ...over,
});

export const sections = (over: Partial<Record<OnboardingSection["kind"], Partial<OnboardingSection>>> = {}): OnboardingSection[] => {
  const base: OnboardingSection[] = [
    {
      kind: "architecture_overview",
      title: "Architecture overview",
      provenance: "ai_written",
      available: true,
      unavailable_reason: null,
      body_markdown: "A **layered** service.",
      diagram: "flowchart TD\n  A --> B",
      items: [],
    },
    {
      kind: "critical_paths",
      title: "Critical paths",
      provenance: "ai_written",
      available: true,
      unavailable_reason: null,
      body_markdown: null,
      diagram: null,
      items: [
        { path: "src/core/engine.ts", description: "The review engine.", description_provenance: "ai_written", importers: 14, endpoints: 3, rank_percentile: 98 },
      ],
    },
    {
      kind: "run_locally",
      title: "How to run locally",
      provenance: "from_index",
      available: true,
      unavailable_reason: null,
      body_markdown: null,
      diagram: null,
      items: [
        { order: 1, command: "pnpm install", annotation: null, source_path: "package.json" },
        { order: 2, command: "pnpm run dev", annotation: "starts the API", source_path: "package.json" },
      ],
    },
    {
      kind: "reading_path",
      title: "Guided reading path",
      provenance: "ai_written",
      available: true,
      unavailable_reason: null,
      body_markdown: null,
      diagram: null,
      items: [
        { order: 1, path: "src/core/engine.ts", reason: "Start here.", reason_provenance: "ai_written", rank_percentile: 98, score: 0.12 },
      ],
    },
    {
      kind: "first_tasks",
      title: "First tasks",
      provenance: "ai_written",
      available: true,
      unavailable_reason: null,
      body_markdown: null,
      diagram: null,
      items: [
        { title: "Add a test", rationale: "Engine lacks a case.", paths: ["src/core/engine.ts"] },
        { title: "Rename a helper", rationale: "Clearer name.", paths: ["src/util.ts"] },
        { title: "Document a flag", rationale: "Undocumented.", paths: ["src/config.ts", "README.md"] },
      ],
    },
  ];
  return base.map((s) => ({ ...s, ...(over[s.kind] ?? {}) }) as OnboardingSection);
};

export const narrativeTour = (over: Partial<OnboardingTour> = {}): OnboardingTour => ({
  generated_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  mode: "narrative",
  skeleton_reason: null,
  completeness: "full",
  partial_reasons: [],
  index: indexSummary(),
  llm: { calls: 1, call_id: "c1", attempts: 1, provider: "openai", model: "gpt-4o-mini", tokens_in: 6000, tokens_out: 1200, cost_usd: 0.0123 },
  dropped_ai_items: 0,
  skipped_files: [],
  sections: sections(),
  ...over,
});

export const skeletonTour = (reason: NonNullable<OnboardingTour["skeleton_reason"]>, over: Partial<OnboardingTour> = {}): OnboardingTour =>
  narrativeTour({
    mode: "skeleton",
    skeleton_reason: reason,
    llm: { calls: 0, call_id: null, attempts: null, provider: null, model: null, tokens_in: null, tokens_out: null, cost_usd: null },
    sections: sections({
      architecture_overview: { provenance: "from_index" },
      critical_paths: { provenance: "from_index" },
      reading_path: { provenance: "from_index" },
      first_tasks: { provenance: "from_index", available: false, items: [], unavailable_reason: "stored text" },
    }),
    ...over,
  });

export const response = (over: Partial<OnboardingTourResponse> = {}): OnboardingTourResponse => ({
  repo_id: "r1",
  repo_full_name: "acme/payments-api",
  tour: narrativeTour(),
  current_index: indexSummary(),
  generation_in_progress: false,
  last_failure: null,
  ...over,
});
