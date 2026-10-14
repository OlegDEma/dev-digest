import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TourHeader } from "./TourHeader";
import { indexSummary, narrativeTour, renderIntl, skeletonTour } from "../../test-utils";
import type { OnboardingTour } from "@devdigest/shared";

afterEach(cleanup);

function renderHeader(tour: OnboardingTour, over: { generating?: boolean; current?: ReturnType<typeof indexSummary> } = {}) {
  const onRegenerate = vi.fn();
  renderIntl(
    <TourHeader
      repoName="acme/payments-api"
      tour={tour}
      currentIndex={over.current ?? tour.index}
      generating={over.generating ?? false}
      onRegenerate={onRegenerate}
    />,
  );
  return { onRegenerate };
}

describe("TourHeader", () => {
  it("shows the title with the repository name emphasised, plus both buttons (AC-7)", () => {
    renderHeader(narrativeTour());
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Onboarding for acme/payments-api");
    expect(screen.getByText("acme/payments-api").tagName).toBe("SPAN");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share link" })).toBeInTheDocument();
  });

  it("renders the subtitle with and without Y (AC-8, AC-9)", () => {
    renderHeader(narrativeTour());
    expect(screen.getByText(/^Generated from index of 5,000 of 12,450 source files \(JS\/TS\) · last refreshed .+/)).toBeInTheDocument();
    cleanup();
    renderHeader(narrativeTour({ index: indexSummary({ source_files_total: null }) }));
    const sub = screen.getByText(/^Generated from index of 5,000 source files \(JS\/TS\) · last refreshed /);
    expect(sub).toBeInTheDocument();
    expect(sub.textContent).not.toMatch(/\d of \d/);
  });

  it("shows the narrative stats line (AC-10)", () => {
    renderHeader(narrativeTour());
    expect(screen.getByText("1 LLM call · 7,200 tokens · $0.0123 · gpt-4o-mini")).toBeInTheDocument();
  });

  it("shows only '0 LLM calls' for a skeleton (AC-11)", () => {
    renderHeader(skeletonTour("no_clone"));
    expect(screen.getByText("0 LLM calls")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it("shows 'cost unknown' when cost is null (AC-12)", () => {
    const t = narrativeTour();
    renderHeader({ ...t, llm: { ...t.llm, cost_usd: null } });
    expect(screen.getByText("1 LLM call · 7,200 tokens · cost unknown · gpt-4o-mini")).toBeInTheDocument();
  });

  it("shows the attempts count above one (AC-13)", () => {
    const t = narrativeTour();
    renderHeader({ ...t, llm: { ...t.llm, attempts: 3 } });
    expect(screen.getByText(/^1 LLM call \(3 attempts\) · /)).toBeInTheDocument();
  });

  it("shows a Partial badge whose description lists the reasons (AC-32)", () => {
    renderHeader(narrativeTour({ completeness: "partial", partial_reasons: ["facts_truncated", "index_capped"] }));
    const badge = screen.getByText("Partial");
    expect(badge).toHaveAccessibleDescription(
      "facts were trimmed to fit 8,000 tokens; 5,000 of 12,450 source files were indexed (cap reached)",
    );
    expect(screen.getByText(/^facts were trimmed to fit 8,000 tokens; /)).toBeVisible();
  });

  it("shows no Partial badge for a full tour", () => {
    renderHeader(narrativeTour());
    expect(screen.queryByText("Partial")).toBeNull();
  });

  it("shows the stale marker only when the SHAs differ (AC-20)", () => {
    renderHeader(narrativeTour(), { current: indexSummary({ last_indexed_sha: "other" }) });
    expect(screen.getByText("The index has changed since this tour was generated")).toBeInTheDocument();
    cleanup();
    renderHeader(narrativeTour());
    expect(screen.queryByText("The index has changed since this tour was generated")).toBeNull();
  });

  it("disables Regenerate and labels it 'Regenerating…' while generating (AC-17)", () => {
    renderHeader(narrativeTour(), { generating: true });
    expect(screen.getByRole("button", { name: "Regenerating…" })).toBeDisabled();
  });

  it("calls onRegenerate", () => {
    const { onRegenerate } = renderHeader(narrativeTour());
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("copies the page URL and confirms 'Link copied' (AC-21)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderHeader(narrativeTour());
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });
});
