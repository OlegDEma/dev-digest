import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { makeDetail, makeResult } from "@/lib/test-support/eval-fixtures";
import type { EvalRunDetail } from "@devdigest/shared";

type Q = { data?: EvalRunDetail; isError: boolean };
const state: Record<string, Q> = {};
vi.mock("@/lib/hooks/evals", () => ({ useEvalRun: (id: string) => state[id] ?? { isError: false } }));

import { CompareModal } from "./CompareModal";

afterEach(cleanup);

function mount(onClose = vi.fn()) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CompareModal runIds={["old", "new"]} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose, ...utils };
}

const older = (over: Partial<EvalRunDetail> = {}) =>
  makeDetail({ id: "old", started_at: "2026-10-01T10:00:00Z", ...over });
const newer = (over: Partial<EvalRunDetail> = {}) =>
  makeDetail({ id: "new", started_at: "2026-10-02T10:00:00Z", ...over });

function setRuns(a: EvalRunDetail, b: EvalRunDetail) {
  state.old = { data: a, isError: false };
  state.new = { data: b, isError: false };
}

describe("CompareModal", () => {
  it("shows a spinner while the runs load (AC-49b)", () => {
    state.old = { isError: false };
    state.new = { isError: false };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading runs…");
  });

  it("shows the error and a Close button when a load fails (AC-49c)", () => {
    state.old = { isError: true };
    state.new = { isError: false };
    const { onClose } = mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load one of the runs.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("titles the view with the older version first, regardless of selection order (AC-49a)", () => {
    const a = older();
    a.config = { ...a.config, agent_version: 6 };
    const b = newer();
    b.config = { ...b.config, agent_version: 7 };
    // hand the hook the newer run first
    state.old = { data: b, isError: false };
    state.new = { data: a, isError: false };
    mount();
    expect(screen.getByRole("heading", { name: "Compare runs · v6 → v7" })).toBeInTheDocument();
  });

  it("shows A → B cards with signed deltas, USD for cost (AC-50)", () => {
    const a = older({ cost_usd: 0.1 });
    const b = newer({ cost_usd: 0.15 });
    b.metrics = { ...b.metrics!, recall: 0.7, precision: 0.7, citation_accuracy: 0.9 };
    setRuns(a, b);
    mount();
    const recall = screen.getByTestId("compare-recall");
    expect(recall).toHaveTextContent("66% → 70%");
    expect(within(recall).getByText("▲ 4 pt")).toBeInTheDocument();
    expect(screen.getByTestId("compare-precision")).toHaveTextContent("80% → 70%");
    expect(within(screen.getByTestId("compare-precision")).getByText("▼ 10 pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("compare-citation_accuracy")).getByText("± 0 pt")).toBeInTheDocument();
    const cost = screen.getByTestId("compare-cost");
    expect(cost).toHaveTextContent("$0.10 → $0.15");
    expect(within(cost).getByText("+$0.05")).toBeInTheDocument();
  });

  it("shows +/− prompt lines (AC-51a)", () => {
    const a = older();
    a.config = { ...a.config, system_prompt: "keep\nold line" };
    const b = newer();
    b.config = { ...b.config, system_prompt: "keep\nnew line" };
    setRuns(a, b);
    mount();
    const pre = screen.getByTestId("prompt-diff");
    expect(within(pre).getByText("− old line")).toBeInTheDocument();
    expect(within(pre).getByText("+ new line")).toBeInTheDocument();
    expect(screen.queryByText("No system prompt change")).toBeNull();
  });

  it("says 'No system prompt change' for identical prompts (AC-51b)", () => {
    setRuns(older(), newer());
    mount();
    expect(screen.getByText("No system prompt change")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-diff")).toBeNull();
  });

  it("lists model, strategy and skill differences (AC-52a)", () => {
    const a = older();
    a.config = { ...a.config, skills: [{ skill_id: "s1", name: "Sec", version: 1 }, { skill_id: "s2", name: "Perf", version: 1 }] };
    const b = newer();
    b.config = {
      ...b.config,
      model: "m2",
      strategy: "map-reduce",
      skills: [{ skill_id: "s1", name: "Sec", version: 2 }, { skill_id: "s3", name: "Style", version: 1 }],
    };
    setRuns(a, b);
    mount();
    expect(screen.getByText("Model: openrouter/m1 → openrouter/m2")).toBeInTheDocument();
    expect(screen.getByText("Strategy: single-pass → map-reduce")).toBeInTheDocument();
    expect(screen.getByText("Skill version changed: Sec v1 → v2")).toBeInTheDocument();
    expect(screen.getByText("Skill added: Style")).toBeInTheDocument();
    expect(screen.getByText("Skill removed: Perf")).toBeInTheDocument();
    expect(screen.queryByText("Same model and skills")).toBeNull();
  });

  it("says 'Same model and skills' when nothing differs (AC-52b)", () => {
    setRuns(older(), newer());
    mount();
    expect(screen.getByText("Same model and skills")).toBeInTheDocument();
  });

  it("warns when the scored case sets differ (AC-53)", () => {
    const a = older({ results: [makeResult({ case_id: "c1" })] });
    const b = newer({ results: [makeResult({ case_id: "c1" }), makeResult({ case_id: "c2" }), makeResult({ case_id: "c3" })] });
    setRuns(a, b);
    mount();
    expect(screen.getByRole("note")).toHaveTextContent(
      "2 cases added, 0 removed between runs — deltas include dataset change",
    );
  });

  it("shows no dataset warning for identical case sets", () => {
    setRuns(older(), newer());
    mount();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("closes on Escape and on Close; the selection is the parent's and untouched (AC-54)", () => {
    setRuns(older(), newer());
    const { onClose } = mount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab focus inside the dialog (NFR-4)", () => {
    setRuns(older(), newer());
    mount();
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    // only one focusable control: focus wraps onto itself
    expect(document.activeElement).toBe(close);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders prompts and skill names as literal text (AC-64)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const a = older();
    a.config = { ...a.config, system_prompt: "ok", skills: [{ skill_id: "s1", name: evil, version: 1 }] };
    const b = newer();
    b.config = { ...b.config, system_prompt: evil, skills: [] };
    setRuns(a, b);
    const { container } = mount();
    expect(container.querySelector("img")).toBeNull();
    expect(within(screen.getByTestId("prompt-diff")).getByText(`+ ${evil}`)).toBeInTheDocument();
    expect(screen.getByText(`Skill removed: ${evil}`)).toBeInTheDocument();
  });
});
