import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";
import { makeCase, makeDetail, makeRun } from "@/lib/test-support/eval-fixtures";

type Q = { data?: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
const ok = (data: unknown): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

let casesState: Q;
let runsState: Q;
let runState: Q;
const trackedIds: Array<string | null | undefined> = [];
const startMutate = vi.fn();

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => casesState,
  useAgentEvalRuns: () => runsState,
  useEvalRun: (id: string | null) => {
    trackedIds.push(id);
    return runState;
  },
  useStartEvalRun: () => ({ mutate: startMutate, isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock("@/components/eval-case-editor", () => ({
  EvalCaseEditor: (p: { caseId?: string | null; onClose: () => void }) => (
    <div role="dialog" aria-label="case editor">
      <span>{`caseId=${p.caseId ?? "none"}`}</span>
      <button onClick={p.onClose}>close editor</button>
    </div>
  ),
}));

import { EvalsTab } from "./EvalsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "m1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_docs: [],
  enabled: true,
  version: 1,
};

const cases = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ id: `c${i}`, name: `case-${i}` }));

beforeEach(() => {
  casesState = ok(cases(8));
  runsState = ok([]);
  runState = { isLoading: false, isError: false, refetch: vi.fn() };
  trackedIds.length = 0;
});
afterEach(() => {
  cleanup();
  startMutate.mockReset();
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

describe("EvalsTab run controls", () => {
  it("shows the case count on the button and starts a run on click (AC-22a, AC-23)", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Run all evals (8)" });
    fireEvent.click(btn);
    expect(startMutate).toHaveBeenCalledTimes(1);
  });

  it("disables the button with zero cases (AC-31b)", () => {
    casesState = ok([]);
    mount();
    expect(screen.getByRole("button", { name: "Run all evals (0)" })).toBeDisabled();
  });

  it("shows 'Running… k / N cases' and disables the button while running (AC-29a, AC-29b)", () => {
    runsState = ok([makeRun({ id: "r9", status: "running", progress: { done: 3, total: 8 }, metrics: null, counts: null })]);
    runState = ok(makeDetail({ id: "r9", status: "running", progress: { done: 3, total: 8 }, metrics: null, counts: null }));
    mount();
    expect(screen.getByText("Running… 3 / 8 cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals (8)" })).toBeDisabled();
    expect(trackedIds).toContain("r9");
  });

  it("shows 'Reconnecting…' when a poll fails and keeps the last progress (AC-29c)", () => {
    runsState = ok([makeRun({ id: "r9", status: "running", progress: { done: 3, total: 8 }, metrics: null, counts: null })]);
    runState = { data: makeDetail({ id: "r9", status: "running", progress: { done: 3, total: 8 }, metrics: null, counts: null }), isLoading: false, isError: true, refetch: vi.fn() };
    mount();
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByText("Running… 3 / 8 cases")).toBeInTheDocument();
  });

  it("attaches to the running run on 409 eval_run_in_progress (AC-30b)", () => {
    startMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("running", 409, "eval_run_in_progress", { run_id: "run9" })),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(trackedIds).toContain("run9");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server message and a Settings link on provider_not_configured (AC-32b)", () => {
    startMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("No API key configured for openrouter", 422, "provider_not_configured")),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No API key configured for openrouter");
    expect(screen.getByRole("link", { name: "Open Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("explains no_eval_cases", () => {
    startMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("x", 422, "no_eval_cases")),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add an eval case before running.");
  });

  it("renders a server error message as literal text (AC-64)", () => {
    startMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("<img src=x onerror=alert(1)>", 500, "boom")),
    );
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});

describe("EvalsTab header and case actions", () => {
  it("shows EVAL METRICS with a 'View full dashboard →' link to the agent's page (AC-D49)", () => {
    mount();
    expect(screen.getByRole("heading", { name: "EVAL METRICS" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("no longer renders run history or the compare flow (moved to the per-agent page)", () => {
    runsState = ok([makeRun({ id: "a" }), makeRun({ id: "b" })]);
    mount();
    expect(screen.queryByText("Run history")).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
  });

  it("keeps 'New eval case' enabled at zero cases and opens an empty editor (AC-D1, AC-D40)", () => {
    casesState = ok([]);
    mount();
    const btn = screen.getByRole("button", { name: "New eval case" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(screen.getByRole("dialog", { name: "case editor" })).toHaveTextContent("caseId=none");
  });

  it("puts Run all evals and New eval case on the cases heading line (AC-D41b)", () => {
    mount();
    const heading = screen.getByRole("heading", { name: "Eval cases" });
    expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "New eval case" }));
  });

  it("opens the editor on a row's edit button, loaded with that case (AC-D39)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit case case-3" }));
    expect(screen.getByRole("dialog", { name: "case editor" })).toHaveTextContent("caseId=c3");
    fireEvent.click(screen.getByRole("button", { name: "close editor" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts a scope-case run from a row's run button (AC-D25)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run case case-2" }));
    expect(startMutate).toHaveBeenCalledTimes(1);
    expect(startMutate.mock.calls[0]![0]).toEqual({ case_id: "c2" });
  });

  it("starts a full run (no body) from Run all evals", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (8)" }));
    expect(startMutate.mock.calls[0]![0]).toBeUndefined();
  });

  it("disables Run all evals and every row run button while a run is queued (AC-D30)", () => {
    runsState = ok([makeRun({ id: "q1", status: "queued", scope: "all", metrics: null, counts: null, progress: { done: 0, total: 8 } })]);
    mount();
    expect(screen.getByRole("button", { name: "Run all evals (8)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case case-0" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New eval case" })).toBeEnabled();
  });

  it("disables run buttons while a single-case run is running (AC-D30)", () => {
    runsState = ok([makeRun({ id: "s1", status: "running", scope: "case", metrics: null, counts: null, progress: { done: 0, total: 1 } })]);
    mount();
    expect(screen.getByRole("button", { name: "Run case case-0" })).toBeDisabled();
  });
});
