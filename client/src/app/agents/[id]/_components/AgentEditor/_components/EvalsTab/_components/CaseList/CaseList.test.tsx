import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { makeCase, makeRun } from "@/lib/test-support/eval-fixtures";

type Q = { data?: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
let casesState: Q;
let runsState: Q;
const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => casesState,
  useAgentEvalRuns: () => runsState,
  useDeleteEvalCase: () => ({ mutate: deleteMutate, isPending: false, isError: false, error: null }),
}));

import { CaseList } from "./CaseList";

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
});

const ok = (data: unknown): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const renderList = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CaseList agentId="ag1" />
    </NextIntlClientProvider>,
  );

describe("CaseList", () => {
  it("shows skeletons while loading (AC-20)", () => {
    casesState = { isLoading: true, isError: false, refetch: vi.fn() };
    runsState = ok([]);
    renderList();
    expect(screen.getByTestId("cases-skeleton")).toBeInTheDocument();
  });

  it("shows an error with Retry (AC-21)", () => {
    const refetch = vi.fn();
    casesState = { isLoading: false, isError: true, refetch };
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty text with zero cases (AC-14b)", () => {
    casesState = ok([]);
    runsState = ok([]);
    renderList();
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
  });

  it("shows the count and the 8+ hint under 8 cases (AC-15)", () => {
    casesState = ok([1, 2, 3, 4, 5].map((i) => makeCase({ id: `c${i}`, name: `case-${i}` })));
    runsState = ok([]);
    renderList();
    expect(screen.getByText(/5 cases/)).toBeInTheDocument();
    expect(screen.getByText(/8\+ cases recommended for stable metrics/)).toBeInTheDocument();
  });

  it("hides the hint from 8 cases up", () => {
    casesState = ok(Array.from({ length: 8 }, (_, i) => makeCase({ id: `c${i}`, name: `case-${i}` })));
    runsState = ok([]);
    renderList();
    expect(screen.queryByText(/8\+ cases recommended/)).toBeNull();
  });

  it("renders name, kind, file:lines, severity · category and last result (AC-16a)", () => {
    casesState = ok([
      makeCase({
        last_result: { run_id: "r1", status: "fail", ran_at: "2026-10-01T10:00:00Z", summary: "expected 1 finding, got 0" },
      }),
      makeCase({
        id: "c2",
        name: "no-flag",
        expectation: { kind: "must_not_flag", file: "src/a.ts", start_line: 5, end_line: 5 },
        display: { title: "t", severity: "WARNING", category: "style" },
      }),
    ]);
    runsState = ok([]);
    renderList();
    const first = screen.getByRole("listitem", { name: "hardcoded-stripe-key" });
    expect(within(first).getByText("must find")).toBeInTheDocument();
    expect(within(first).getByText("src/config.ts:11-13")).toBeInTheDocument();
    expect(within(first).getByText("CRITICAL · security")).toBeInTheDocument();
    expect(within(first).getByText("failed")).toBeInTheDocument();
    expect(within(first).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    const second = screen.getByRole("listitem", { name: "no-flag" });
    expect(within(second).getByText("must not flag")).toBeInTheDocument();
    expect(within(second).getByText("src/a.ts:5")).toBeInTheDocument();
    expect(within(second).getByText("never run")).toBeInTheDocument();
  });

  const LONG = "a-very-long-case-name-".repeat(8);

  it("truncates a long name to one line (AC-16b i)", () => {
    casesState = ok([makeCase({ name: LONG })]);
    runsState = ok([]);
    renderList();
    expect(screen.getByTestId("case-name")).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
  });

  it("keeps the full name on hover and in the accessible name (AC-16b ii)", () => {
    casesState = ok([makeCase({ name: LONG })]);
    runsState = ok([]);
    renderList();
    expect(screen.getByTestId("case-name")).toHaveAttribute("title", LONG);
    expect(screen.getByRole("listitem", { name: LONG })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Delete ${LONG}` })).toBeInTheDocument();
  });

  it("shows '<passed> / <scored> passing' from the latest finished run (AC-17)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([makeRun()]);
    renderList();
    expect(screen.getByText("6 / 8 passing")).toBeInTheDocument();
  });

  it("deletes a case only after confirming (AC-18a)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Delete hardcoded-stripe-key" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("cancelling the dialog keeps the case", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Delete hardcoded-stripe-key" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders user text as literal text, never markup (AC-64)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    casesState = ok([
      makeCase({
        name: evil,
        last_result: { run_id: "r1", status: "fail", ran_at: "2026-10-01T10:00:00Z", summary: evil },
      }),
    ]);
    runsState = ok([]);
    const { container } = renderList();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
  });
});
