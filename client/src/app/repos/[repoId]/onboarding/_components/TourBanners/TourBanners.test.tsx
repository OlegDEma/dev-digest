import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { OnboardingLastFailure, OnboardingSkeletonReason } from "@devdigest/shared";
import { ApiError } from "../../../../../../lib/api";
import { TourBanners } from "./TourBanners";
import { indexSummary, narrativeTour, renderIntl, skeletonTour } from "../../test-utils";

afterEach(cleanup);

const failure = (reason: OnboardingSkeletonReason, over: Partial<OnboardingLastFailure> = {}): OnboardingLastFailure => ({
  at: new Date().toISOString(),
  reason,
  provider: "openai",
  attempts: null,
  ...over,
});

describe("TourBanners — skeleton banner (AC-31)", () => {
  const cases: [OnboardingSkeletonReason, string][] = [
    ["no_clone", "Showing the index skeleton — Clone not available. Regenerate once the repository is cloned."],
    ["index_unavailable", "Showing the index skeleton — The code index is not available (status: degraded). Resync the index, then regenerate."],
    ["no_import_graph", "Showing the index skeleton — No JS/TS import graph — the indexer reads only .ts, .tsx, .js, .jsx, .mjs and .cjs files. The AI narrative needs a JS/TS repository."],
    ["llm_not_configured", "Showing the index skeleton — No API key for anthropic. Add one in Settings → API Keys, then regenerate."],
    ["llm_failed", "Showing the index skeleton — The AI call failed. Regenerate to try again."],
    ["llm_invalid_output", "Showing the index skeleton — The AI reply did not match the expected format after 3 attempts. Regenerate to try again."],
    ["llm_timeout", "Showing the index skeleton — The AI call took longer than 120 s. Regenerate to try again."],
  ];

  it.each(cases)("%s", (reason, text) => {
    const tour = skeletonTour(reason, {
      index: indexSummary({ status: "degraded" }),
    });
    tour.llm = { ...tour.llm, provider: "anthropic", attempts: reason === "llm_invalid_output" ? 3 : null };
    renderIntl(<TourBanners tour={tour} lastFailure={null} currentIndex={tour.index} generateError={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("falls back to an i18n phrase when the provider is unknown (W5)", () => {
    const tour = skeletonTour("llm_not_configured");
    renderIntl(<TourBanners tour={tour} lastFailure={null} currentIndex={tour.index} generateError={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("No API key for the selected provider.");
  });

  it("shows no skeleton banner for a narrative tour", () => {
    const tour = narrativeTour();
    renderIntl(<TourBanners tour={tour} lastFailure={null} currentIndex={tour.index} generateError={null} />);
    expect(screen.queryByText(/Showing the index skeleton/)).toBeNull();
  });
});

describe("TourBanners — failure banner (AC-71, AC-78)", () => {
  it("llm_timeout", () => {
    const tour = narrativeTour();
    renderIntl(<TourBanners tour={tour} lastFailure={failure("llm_timeout")} currentIndex={tour.index} generateError={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Regeneration failed — The AI call took longer than 120 s\. Regenerate to try again\. Showing the tour from 3 hours ago\.$/,
    );
  });

  it("no_clone", () => {
    const tour = narrativeTour();
    renderIntl(<TourBanners tour={tour} lastFailure={failure("no_clone")} currentIndex={tour.index} generateError={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Regeneration failed — Clone not available. Regenerate once the repository is cloned. Showing the tour from",
    );
  });

  it("index_unavailable fills the status from the current index", () => {
    const tour = narrativeTour();
    renderIntl(
      <TourBanners
        tour={tour}
        lastFailure={failure("index_unavailable")}
        currentIndex={indexSummary({ status: "degraded" })}
        generateError={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Regeneration failed — The code index is not available (status: degraded). Resync the index, then regenerate. Showing the tour from",
    );
  });

  it("fills provider and attempts from last_failure", () => {
    const tour = narrativeTour();
    const { unmount } = renderIntl(
      <TourBanners tour={tour} lastFailure={failure("llm_not_configured", { provider: "openrouter" })} currentIndex={tour.index} generateError={null} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("No API key for openrouter.");
    unmount();
    renderIntl(
      <TourBanners tour={tour} lastFailure={failure("llm_invalid_output", { attempts: 3 })} currentIndex={tour.index} generateError={null} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("after 3 attempts.");
  });

  it("shows no 'Regeneration failed —' text when last_failure is null", () => {
    const tour = narrativeTour();
    renderIntl(<TourBanners tour={tour} lastFailure={null} currentIndex={tour.index} generateError={null} />);
    expect(screen.queryByText(/Regeneration failed —/)).toBeNull();
  });
});

describe("TourBanners — dropped items and errors", () => {
  it("words the dropped-items notice in singular and plural (AC-72)", () => {
    const one = narrativeTour({ dropped_ai_items: 1 });
    const { unmount } = renderIntl(<TourBanners tour={one} lastFailure={null} currentIndex={one.index} generateError={null} />);
    expect(screen.getByText(/^1 AI item was dropped/)).toBeInTheDocument();
    unmount();
    const two = narrativeTour({ dropped_ai_items: 2 });
    renderIntl(<TourBanners tour={two} lastFailure={null} currentIndex={two.index} generateError={null} />);
    expect(screen.getByText("2 AI items were dropped because they cited files not in the index")).toBeInTheDocument();
  });

  it("shows no dropped notice at zero", () => {
    const tour = narrativeTour();
    renderIntl(<TourBanners tour={tour} lastFailure={null} currentIndex={tour.index} generateError={null} />);
    expect(screen.queryByText(/AI item/)).toBeNull();
  });

  it("shows the 409 message for generation_in_progress (AC-70)", () => {
    const err = new ApiError("busy", 409, "generation_in_progress");
    renderIntl(<TourBanners tour={null} lastFailure={null} currentIndex={indexSummary()} generateError={err} />);
    expect(screen.getByRole("alert")).toHaveTextContent("A generation is already running for this repository");
  });

  it("shows a generic message for any other generate error", () => {
    renderIntl(
      <TourBanners tour={null} lastFailure={null} currentIndex={indexSummary()} generateError={new ApiError("x", 429, "rate_limited")} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t generate the onboarding tour");
  });
});
