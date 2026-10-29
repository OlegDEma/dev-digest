import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";
import { formatWhen } from "@/lib/eval-format";
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

describe("EvalsTab compare flow", () => {
  it("opens the compare view for two selected runs; Escape closes it and keeps the selection (AC-54)", () => {
    const a = makeRun({ id: "a", started_at: "2026-10-02T10:00:00.000Z" });
    const b = makeRun({ id: "b", started_at: "2026-10-01T10:00:00.000Z" });
    runsState = ok([a, b]);
    runState = ok(makeDetail());
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${formatWhen(a.started_at)}` }));
    fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${formatWhen(b.started_at)}` }));
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("checkbox", { name: `Select run ${formatWhen(a.started_at)}` })).toBeChecked();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
  });
});
