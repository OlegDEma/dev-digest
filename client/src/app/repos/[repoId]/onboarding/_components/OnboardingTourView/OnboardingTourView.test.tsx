import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { ApiError } from "../../../../../../lib/api";
import { indexSummary, narrativeTour, renderIntl, response, skeletonTour } from "../../test-utils";

const refetch = vi.fn();
const mutate = vi.fn();
let query: { data?: OnboardingTourResponse; isLoading: boolean; isError: boolean; refetch: () => void };
let mutation: { isPending: boolean; error: Error | null; mutate: () => void };

const useTour = vi.fn((_id: string) => query);
vi.mock("../../../../../../lib/hooks/onboarding", () => ({
  useOnboardingTour: (id: string) => useTour(id),
  useGenerateOnboardingTour: () => mutation,
}));
vi.mock("../ArchitectureBody", () => ({
  ArchitectureBody: ({ body }: { body: string | null }) => <div>{body}</div>,
}));

import { OnboardingTourView } from "./OnboardingTourView";

beforeEach(() => {
  query = { data: response(), isLoading: false, isError: false, refetch };
  mutation = { isPending: false, error: null, mutate };
});

afterEach(() => {
  cleanup();
  refetch.mockReset();
  mutate.mockReset();
});

const view = () => renderIntl(<OnboardingTourView repoId="r1" />);

describe("OnboardingTourView", () => {
  it("shows the empty state naming the five sections in order, and does not generate on open (AC-5, AC-6)", () => {
    query.data = response({ tour: null });
    view();
    expect(screen.getByRole("heading", { name: "Generate onboarding tour" })).toBeInTheDocument();
    const body = screen.getByText(/^DevDigest writes a five-section tour/).textContent!;
    const names = ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"];
    const positions = names.map((n) => body.indexOf(n));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("generates only when the button is activated", () => {
    query.data = response({ tour: null });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("disables the button and labels it 'Generating…' while generating with no tour (AC-17)", () => {
    query.data = response({ tour: null, generation_in_progress: true });
    view();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  it("keeps the old tour visible and labels Regenerate 'Regenerating…' during a generation (AC-17, AC-18)", () => {
    mutation.isPending = true;
    view();
    expect(screen.getByRole("button", { name: "Regenerating…" })).toBeDisabled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for acme/payments-api");
    expect(screen.getAllByRole("button", { name: "Critical paths" }).length).toBeGreaterThan(0);
  });

  it("treats a server-reported running generation like a pending one (AC-18)", () => {
    query.data = response({ generation_in_progress: true });
    view();
    expect(screen.getByRole("button", { name: "Regenerating…" })).toBeDisabled();
  });

  it("shows the load error with a working Retry (AC-19)", () => {
    query = { data: undefined, isLoading: false, isError: true, refetch };
    view();
    expect(screen.getByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the five sections in order with the 'On this page' list (AC-14)", () => {
    view();
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const entries = Array.from(toc.querySelectorAll("button")).map((b) => b.textContent);
    expect(entries).toEqual(["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"]);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(entries);
  });

  it("moves focus to the section heading from the TOC (AC-73)", () => {
    view();
    const toc = screen.getByRole("navigation", { name: "On this page" });
    fireEvent.click(Array.from(toc.querySelectorAll("button")).find((b) => b.textContent === "Guided reading path")!);
    const heading = screen.getAllByRole("heading", { level: 2 }).find((h) => h.textContent === "Guided reading path")!;
    expect(heading).toHaveFocus();
  });

  it("collapses a section and exposes aria-expanded (AC-15)", () => {
    view();
    const toggle = screen.getAllByRole("button", { name: "How to run locally" }).find((b) => b.hasAttribute("aria-expanded"))!;
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the skeleton banner, from-index badges and the AC-53 text for a skeleton (AC-16, AC-31, AC-53)", () => {
    query.data = response({ tour: skeletonTour("no_clone") });
    view();
    expect(screen.getByText(/Showing the index skeleton — Clone not available\./)).toBeInTheDocument();
    expect(screen.queryByText("AI-written")).toBeNull();
    expect(screen.getByText("First tasks are written by the AI narrative — unavailable in the skeleton.")).toBeInTheDocument();
  });

  it("shows the failure banner only while last_failure is set (AC-71, AC-78)", () => {
    query.data = response({
      last_failure: { at: new Date().toISOString(), reason: "llm_timeout", provider: "openai", attempts: null },
    });
    const first = view();
    expect(screen.getByText(/^Regeneration failed — The AI call took longer than 120 s\./)).toBeInTheDocument();
    first.unmount();
    query.data = response();
    view();
    expect(screen.queryByText(/Regeneration failed —/)).toBeNull();
  });

  it("shows the stale marker when the current index SHA differs (AC-20)", () => {
    query.data = response({ current_index: indexSummary({ last_indexed_sha: "newer" }) });
    view();
    expect(screen.getByText("The index has changed since this tour was generated")).toBeInTheDocument();
  });

  it("shows the 409 message after a conflicting generate (AC-70)", () => {
    mutation.error = new ApiError("busy", 409, "generation_in_progress");
    view();
    expect(screen.getByText("A generation is already running for this repository")).toBeInTheDocument();
  });

  it("starts a regeneration from the header", () => {
    query.data = response({ tour: narrativeTour() });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders the stored tour of another repository after the id changes (AC-4)", () => {
    const { rerender } = view();
    query.data = response({ repo_id: "r2", repo_full_name: "acme/other", tour: null });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView repoId="r2" />
      </NextIntlClientProvider>,
    );
    expect(useTour).toHaveBeenLastCalledWith("r2");
    expect(screen.getByRole("heading", { name: "Generate onboarding tour" })).toBeInTheDocument();
  });
});
