import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { makeRun } from "@/lib/test-support/eval-fixtures";

let runsState: { data?: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
vi.mock("@/lib/hooks/evals", () => ({ useAgentEvalRuns: () => runsState }));

import { MetricCards } from "./MetricCards";

afterEach(cleanup);

const renderCards = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <MetricCards agentId="ag1" />
    </NextIntlClientProvider>,
  );

describe("MetricCards", () => {
  it("shows skeletons while loading (AC-20)", () => {
    runsState = { isLoading: true, isError: false, refetch: vi.fn() };
    renderCards();
    expect(screen.getByTestId("metrics-skeleton")).toBeInTheDocument();
  });

  it("shows an error with Retry when loading fails (AC-21)", () => {
    const refetch = vi.fn();
    runsState = { isLoading: false, isError: true, refetch };
    renderCards();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("shows dashes and 'No runs yet' without a finished run (AC-44b)", () => {
    runsState = { data: [makeRun({ status: "running", metrics: null, counts: null })], isLoading: false, isError: false, refetch: vi.fn() };
    renderCards();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-recall")).getByText("—")).toBeInTheDocument();
  });

  it("shows whole-number percentages, strict/unlabelled/macro text and cases passed (AC-44a, AC-42b)", () => {
    runsState = { data: [makeRun()], isLoading: false, isError: false, refetch: vi.fn() };
    renderCards();
    const recall = screen.getByTestId("metric-recall");
    expect(within(recall).getByText("66%")).toBeInTheDocument();
    expect(within(recall).getByText("macro 60%")).toBeInTheDocument();
    const precision = screen.getByTestId("metric-precision");
    expect(within(precision).getByText("80%")).toBeInTheDocument();
    expect(within(precision).getByText("strict 55%")).toBeInTheDocument();
    expect(within(precision).getByText("3 unlabelled")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-citation_accuracy")).getByText("90%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-passed")).getByText("6/8")).toBeInTheDocument();
  });

  it("renders a null metric as a dash (AC-41c)", () => {
    runsState = {
      data: [makeRun({ metrics: { recall: null, precision: null, strict_precision: null, citation_accuracy: null, macro_recall: null, macro_precision: null } })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderCards();
    expect(within(screen.getByTestId("metric-recall")).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-recall")).getByText("macro —")).toBeInTheDocument();
  });

  it("writes the delta vs the previous finished run as text (AC-45a)", () => {
    const prev = makeRun({ id: "r0", started_at: "2026-09-01T10:00:00.000Z" });
    prev.metrics = { ...prev.metrics!, recall: 0.62, precision: 0.85, citation_accuracy: 0.9 };
    runsState = { data: [makeRun(), prev], isLoading: false, isError: false, refetch: vi.fn() };
    renderCards();
    expect(within(screen.getByTestId("metric-recall")).getByText("▲ 4 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-precision")).getByText("▼ 5 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-citation_accuracy")).getByText("± 0 pt")).toBeInTheDocument();
  });

  it("shows no delta with only one finished run (AC-45b)", () => {
    runsState = { data: [makeRun()], isLoading: false, isError: false, refetch: vi.fn() };
    renderCards();
    expect(screen.queryByText(/[▲▼±]/)).toBeNull();
  });
});
