import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { makeRun } from "@/lib/test-support/eval-fixtures";
import { formatWhen } from "@/lib/eval-format";

type Q = { data?: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
let runsState: Q;
vi.mock("@/lib/hooks/evals", () => ({ useAgentEvalRuns: () => runsState }));

import { RunHistory } from "./RunHistory";

afterEach(cleanup);

const ok = (data: unknown): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const T1 = "2026-10-03T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";
const T3 = "2026-10-01T10:00:00.000Z";

function renderHistory(selected: string[] = [], onCompare = vi.fn(), onToggle = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RunHistory agentId="ag1" selected={selected} onToggle={onToggle} onCompare={onCompare} />
    </NextIntlClientProvider>,
  );
  return { onCompare, onToggle };
}

describe("RunHistory", () => {
  it("shows skeletons while loading (AC-20)", () => {
    runsState = { isLoading: true, isError: false, refetch: vi.fn() };
    renderHistory();
    expect(screen.getByTestId("history-skeleton")).toBeInTheDocument();
  });

  it("shows an error with Retry (AC-21)", () => {
    const refetch = vi.fn();
    runsState = { isLoading: false, isError: true, refetch };
    renderHistory();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty text without runs (AC-46b)", () => {
    runsState = ok([]);
    renderHistory();
    expect(screen.getByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
  });

  it("lists columns, '—' for unknown cost, and the status (AC-46a)", () => {
    runsState = ok([
      makeRun({ id: "a", started_at: T1, cost_usd: null }),
      makeRun({ id: "b", started_at: T2, status: "partial", cost_usd: 0.05 }),
      makeRun({ id: "c", started_at: T3, status: "failed", metrics: null, counts: null, error: "boom" }),
    ]);
    renderHistory();
    expect(screen.getAllByText("v1")).toHaveLength(3);
    expect(screen.getAllByText("66%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6/8").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0.05")).toHaveLength(2);
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("lists at most 50 runs (AC-46a)", () => {
    runsState = ok(
      Array.from({ length: 60 }, (_, i) =>
        makeRun({ id: `r${i}`, started_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }),
      ),
    );
    renderHistory();
    expect(screen.getAllByRole("checkbox")).toHaveLength(50);
  });

  it("marks 'config changed' for same version, different config id (AC-47)", () => {
    const a = makeRun({ id: "a", started_at: T1 });
    a.config = { ...a.config, config_id: "cfg2" };
    runsState = ok([a, makeRun({ id: "b", started_at: T2 })]);
    renderHistory();
    expect(screen.getAllByText("config changed")).toHaveLength(1);
  });

  it("names each checkbox 'Select run <ran at>' (AC-48a)", () => {
    runsState = ok([makeRun({ id: "a", started_at: T1 })]);
    renderHistory();
    expect(screen.getByRole("checkbox", { name: `Select run ${formatWhen(T1)}` })).toBeInTheDocument();
  });

  it("toggles a selection through the callback", () => {
    runsState = ok([makeRun({ id: "a", started_at: T1 })]);
    const { onToggle } = renderHistory();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("enables Compare only with exactly two finished runs selected (AC-48b)", () => {
    runsState = ok([
      makeRun({ id: "a", started_at: T1 }),
      makeRun({ id: "b", started_at: T2 }),
      makeRun({ id: "c", started_at: T3, status: "running", metrics: null, counts: null }),
    ]);
    const compare = () => screen.getByRole("button", { name: "Compare" });
    const { rerender } = (() => {
      const r = render(
        <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
          <RunHistory agentId="ag1" selected={[]} onToggle={vi.fn()} onCompare={vi.fn()} />
        </NextIntlClientProvider>,
      );
      return r;
    })();
    const withSel = (sel: string[]) =>
      rerender(
        <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
          <RunHistory agentId="ag1" selected={sel} onToggle={vi.fn()} onCompare={vi.fn()} />
        </NextIntlClientProvider>,
      );
    expect(compare()).toBeDisabled();
    withSel(["a"]);
    expect(compare()).toBeDisabled();
    withSel(["a", "b"]);
    expect(compare()).toBeEnabled();
    withSel(["a", "b", "c"]);
    expect(compare()).toBeDisabled();
    withSel(["a", "c"]);
    expect(compare()).toBeDisabled();
  });
});
