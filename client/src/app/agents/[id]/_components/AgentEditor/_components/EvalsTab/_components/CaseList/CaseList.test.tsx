import React from "react";
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
  onRunCase.mockReset();
  onEdit.mockReset();
});

const ok = (data: unknown): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const onRunCase = vi.fn();
const onEdit = vi.fn();
const renderList = (props: { runDisabled?: boolean; actions?: React.ReactNode } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CaseList agentId="ag1" runDisabled={props.runDisabled ?? false} actions={props.actions} onRunCase={onRunCase} onEdit={onEdit} />
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

  it("renders icon alt text, monospace name, summary or 'never run' (AC-D37)", () => {
    casesState = ok([
      makeCase({
        last_result: { run_id: "r1", status: "fail", ran_at: "2026-10-01T10:00:00Z", summary: "expected 1 finding, got 0", duration_ms: null, cost_usd: null, case_revision: 1 },
      }),
      makeCase({ id: "c2", name: "silent-case", expected: [] }),
      makeCase({
        id: "c3",
        name: "boom",
        last_result: { run_id: "r1", status: "error", ran_at: "2026-10-01T10:00:00Z", summary: "diff has no reviewable files", duration_ms: null, cost_usd: null, case_revision: 1 },
      }),
      makeCase({
        id: "c4",
        name: "good",
        last_result: { run_id: "r1", status: "pass", ran_at: "2026-10-01T10:00:00Z", summary: "expected 1 finding, got 1", duration_ms: 1000, cost_usd: 0.01, case_revision: 1 },
      }),
    ]);
    runsState = ok([]);
    renderList();
    const first = screen.getByRole("listitem", { name: "hardcoded-stripe-key" });
    expect(within(first).getByRole("img", { name: "failed" })).toBeInTheDocument();
    expect(within(first).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(within(first).getByTestId("case-name")).toHaveStyle({ fontFamily: "var(--font-mono, monospace)" });
    const second = screen.getByRole("listitem", { name: "silent-case" });
    expect(within(second).getByRole("img", { name: "never run" })).toBeInTheDocument();
    expect(within(second).getByText("never run")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "boom" })).getByRole("img", { name: "errored" })).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "good" })).getByRole("img", { name: "passed" })).toBeInTheDocument();
  });

  it("shows the chip variants (AC-D38)", () => {
    const f = (over: object) => ({ kind: "must_find" as const, file: "a.ts", start_line: 1, severity: "WARNING" as const, category: "bug" as const, ...over });
    casesState = ok([
      makeCase({ id: "c1", name: "one", expected: [f({ severity: "CRITICAL", category: "security" })] }),
      makeCase({ id: "c2", name: "three", expected: [f({ severity: "CRITICAL", category: "security" }), f({}), f({ kind: "must_not_flag" })] }),
      makeCase({ id: "c3", name: "silent", expected: [] }),
      makeCase({ id: "c4", name: "forbidden", expected: [f({ kind: "must_not_flag" })] }),
    ]);
    runsState = ok([]);
    renderList();
    expect(within(screen.getByRole("listitem", { name: "one" })).getByText("CRITICAL · security")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "three" })).getByText("CRITICAL · security +2")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "silent" })).getByText("empty []")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "forbidden" })).getByText("must not flag")).toBeInTheDocument();
  });

  it("shows 'edited since last run' only when the result is older than the revision (AC-D23)", () => {
    const res = { run_id: "r1", status: "pass" as const, ran_at: "2026-10-01T10:00:00Z", summary: "ok", duration_ms: 1, cost_usd: 0, case_revision: 1 };
    casesState = ok([
      makeCase({ id: "c1", name: "stale", revision: 2, last_result: res }),
      makeCase({ id: "c2", name: "fresh", revision: 1, last_result: res }),
      makeCase({ id: "c3", name: "never", revision: 3, last_result: null }),
    ]);
    runsState = ok([]);
    renderList();
    expect(within(screen.getByRole("listitem", { name: "stale" })).getByText("edited since last run")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "fresh" })).queryByText("edited since last run")).toBeNull();
    expect(within(screen.getByRole("listitem", { name: "never" })).queryByText("edited since last run")).toBeNull();
  });

  it("run and edit buttons carry accessible names and call back with the case id (AC-D25, AC-D39)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Run case hardcoded-stripe-key" }));
    expect(onRunCase).toHaveBeenCalledWith("c1");
    fireEvent.click(screen.getByRole("button", { name: "Edit case hardcoded-stripe-key" }));
    expect(onEdit).toHaveBeenCalledWith("c1");
  });

  it("disables every row run button while a run is active, but not edit/delete (AC-D30)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList({ runDisabled: true });
    expect(screen.getByRole("button", { name: "Run case hardcoded-stripe-key" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit case hardcoded-stripe-key" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete case hardcoded-stripe-key" })).toBeEnabled();
  });

  it("renders the caller's actions on the heading line, even with zero cases (AC-D40, AC-D41b)", () => {
    casesState = ok([]);
    runsState = ok([]);
    renderList({ actions: <button>New eval case</button> });
    const heading = screen.getByRole("heading", { name: "Eval cases" });
    expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "New eval case" }));
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
    expect(screen.getByRole("button", { name: `Delete case ${LONG}` })).toBeInTheDocument();
  });

  it("shows '<passed> / <scored> passing' from the latest finished full run (AC-D41a)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([
      makeRun(),
      makeRun({ id: "single", scope: "case", started_at: "2026-10-02T10:00:00.000Z", counts: { ...makeRun().counts!, cases_passed: 1, cases_scored: 1 } }),
    ]);
    renderList();
    expect(screen.getByText("6 / 8 passing")).toBeInTheDocument();
    expect(screen.queryByText("1 / 1 passing")).toBeNull();
  });

  it("deletes a case only after confirming (AC-18a)", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Delete case hardcoded-stripe-key" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("cancelling the dialog keeps the case", () => {
    casesState = ok([makeCase()]);
    runsState = ok([]);
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Delete case hardcoded-stripe-key" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders user text as literal text, never markup (AC-64)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    casesState = ok([
      makeCase({
        name: evil,
        last_result: { run_id: "r1", status: "fail", ran_at: "2026-10-01T10:00:00Z", summary: evil, duration_ms: null, cost_usd: null, case_revision: 1 },
      }),
    ]);
    runsState = ok([]);
    const { container } = renderList();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
  });
});
