import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentEvalDashboard } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import dashMessages from "../../../../../../messages/en/evalDashboard.json";
import { makeRun } from "@/lib/test-support/eval-fixtures";
import { makeAgentDashboard, makePoint } from "@/lib/test-support/eval-dashboard-fixtures";
import { formatWhen } from "@/lib/eval-format";

type Q = { data?: AgentEvalDashboard; isLoading: boolean; isError: boolean; refetch: () => void };
let state: Q;
let range: string | null = null;
const push = vi.fn();
const replace = vi.fn();
const startMutate = vi.fn();
let start: { isPending: boolean; mutate: typeof startMutate };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({ get: () => range }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/hooks/eval-dashboards", () => ({ useAgentEvalDashboard: (_id: string, r: string) => ({ ...state, requestedRange: r }) }));
vi.mock("@/lib/hooks/evals", () => ({ useStartEvalRun: () => start }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "Security Reviewer" }, { id: "ag2", name: "Perf Reviewer" }] }),
}));
vi.mock("./_components/CompareModal", () => ({
  CompareModal: ({ runIds }: { runIds: string[] }) => <div role="dialog">compare {runIds.join(",")}</div>,
}));

import { AgentEvalPage } from "./AgentEvalPage";

beforeEach(() => {
  range = null;
  start = { isPending: false, mutate: startMutate };
});
afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  startMutate.mockReset();
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, evalDashboard: dashMessages }}>
      <AgentEvalPage agentId="ag1" />
    </NextIntlClientProvider>,
  );
const ok = (data: AgentEvalDashboard): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

describe("AgentEvalPage", () => {
  it("shows the header: All agents, agent selector, 7/30/90 with 30 pressed by default, Run eval (AC-D65a)", () => {
    state = ok(makeAgentDashboard());
    mount();
    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("combobox")).toHaveValue("ag1");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag2" } });
    expect(push).toHaveBeenCalledWith("/eval/ag2");
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(replace).toHaveBeenCalledWith("/eval/ag1?range=90d");
  });

  it("takes the range from ?range= (AC-D65a)", () => {
    range = "7d";
    state = ok(makeAgentDashboard());
    mount();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows cards with values and text deltas from the latest and previous full runs (AC-D67)", () => {
    state = ok(makeAgentDashboard());
    mount();
    expect(screen.getByTestId("metric-recall")).toHaveTextContent("RECALL");
    expect(screen.getByTestId("metric-recall")).toHaveTextContent("66%");
    expect(screen.getByTestId("metric-recall")).toHaveTextContent("▼ 4 pt");
    expect(screen.getByTestId("metric-precision")).toHaveTextContent("± 0 pt");
    expect(screen.getByTestId("metric-citation_accuracy")).toHaveTextContent("90%");
  });

  it("composes the banner from the spec template and announces it as a status (AC-D82, AC-D83, AC-D84)", () => {
    const reg = (over: Partial<NonNullable<AgentEvalDashboard["regression"]>>) =>
      ok(makeAgentDashboard({ regression: { agent_version: 7, drops: [], rises: [], forbidden_hits_delta: 0, fn_delta: 0, ...over } }));
    // spec example: dip + new false positive + both others up
    state = reg({
      drops: [{ metric: "precision", points: -2 }],
      rises: [{ metric: "recall", points: 3 }, { metric: "citation_accuracy", points: 1 }],
      forbidden_hits_delta: 1,
    });
    let m = mount();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up.",
    );
    m.unmount();
    // missed findings (plural), one metric up, one unchanged
    state = reg({ drops: [{ metric: "recall", points: -4 }], rises: [{ metric: "precision", points: 2 }], fn_delta: 3 });
    m = mount();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Recall dipped 4pts on v7 — 3 expected findings missed. Precision up. Citation unchanged.",
    );
    m.unmount();
    // singular finding, both false positive and missed, others unchanged
    state = reg({ drops: [{ metric: "citation_accuracy", points: -1 }], forbidden_hits_delta: 2, fn_delta: 1 });
    m = mount();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Citation dipped 1pts on v7 — a new false positive slipped in — 1 expected finding missed. Recall and precision unchanged.",
    );
    m.unmount();
    // no drop → no banner
    state = reg({ rises: [{ metric: "recall", points: 3 }] });
    mount();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("draws the trend with a legend and a text alternative, or says there is not enough data (AC-D65b, AC-D68)", () => {
    state = ok(makeAgentDashboard());
    const { unmount } = mount();
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/Metric trend over 2 runs\. v1, .*recall 70%, precision 80%, citation 90%\./);
    for (const l of ["Recall", "Precision", "Citation"]) expect(screen.getByText(l)).toBeInTheDocument();
    unmount();
    state = ok(makeAgentDashboard({ series: [makePoint()] }));
    mount();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Not enough runs in this range for a trend")).toBeInTheDocument();
  });

  it("lists recent runs of both scopes with '1 case', bars as text, PASS and COST (AC-D66)", () => {
    const caseRun = makeRun({ id: "rc", scope: "case", started_at: "2026-10-03T10:00:00.000Z", cost_usd: null });
    state = ok(makeAgentDashboard({ runs: [...makeAgentDashboard().runs, caseRun] }));
    mount();
    const rows = screen.getAllByTestId("agent-run-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("1 case");
    expect(rows[0]).toHaveTextContent("—");
    expect(rows[1]).toHaveTextContent("66%");
    expect(rows[1]).toHaveTextContent("6/8");
    expect(rows[1]).toHaveTextContent("$0.05");
    expect(screen.getByRole("columnheader", { name: "COST" })).toBeInTheDocument();
  });

  it("limits the table to 50 runs (AC-D66)", () => {
    const runs = Array.from({ length: 60 }, (_, i) => makeRun({ id: `r${i}`, started_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }));
    state = ok(makeAgentDashboard({ runs }));
    mount();
    expect(screen.getAllByRole("checkbox")).toHaveLength(50);
  });

  it("counts the selection and enables Compare only for exactly two finished full runs (AC-D69a, AC-D69b)", () => {
    const a = makeRun({ id: "a", started_at: "2026-10-01T10:00:00.000Z" });
    const b = makeRun({ id: "b", started_at: "2026-10-02T10:00:00.000Z" });
    const c = makeRun({ id: "c", started_at: "2026-10-03T10:00:00.000Z", scope: "case" });
    const d = makeRun({ id: "d", started_at: "2026-10-04T10:00:00.000Z", status: "queued", metrics: null, counts: null });
    state = ok(makeAgentDashboard({ runs: [a, b, c, d] }));
    mount();
    const compare = () => screen.getByRole("button", { name: "Compare" });
    const pick = (r: typeof a) => fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${formatWhen(r.started_at)}` }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(compare()).toBeDisabled();
    pick(a);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare()).toBeDisabled();
    pick(b);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare()).toBeEnabled();
    pick(c);
    expect(compare()).toBeDisabled();
    pick(c);
    pick(d);
    expect(compare()).toBeDisabled();
    pick(d);
    fireEvent.click(compare());
    expect(screen.getByRole("dialog")).toHaveTextContent("compare");
  });

  it("drops selected runs that leave the table when the range changes (AC-D69a, AC-D69b)", () => {
    const a = makeRun({ id: "a", started_at: "2026-10-01T10:00:00.000Z" });
    const b = makeRun({ id: "b", started_at: "2026-10-02T10:00:00.000Z" });
    const c = makeRun({ id: "c", started_at: "2026-10-03T10:00:00.000Z" });
    state = ok(makeAgentDashboard({ runs: [a, b, c] }));
    const ui = () => (
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, evalDashboard: dashMessages }}>
        <AgentEvalPage agentId="ag1" />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui());
    for (const r of [a, b]) fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${formatWhen(r.started_at)}` }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();

    // a narrower range no longer lists run a
    state = ok(makeAgentDashboard({ runs: [b, c] }));
    rerender(ui());
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${formatWhen(c.started_at)}` }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
  });

  it("starts a full run and disables Run eval while one is running or queued, showing progress (AC-D72, AC-D30)", () => {
    state = ok(makeAgentDashboard());
    const { unmount } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(startMutate).toHaveBeenCalledTimes(1);
    unmount();

    state = ok(makeAgentDashboard({ runs: [makeRun({ id: "x", status: "running", progress: { done: 2, total: 8 } })] }));
    const m = mount();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getByText("Running… 2 / 8 cases")).toBeInTheDocument();
    m.unmount();

    state = ok(makeAgentDashboard({ runs: [makeRun({ id: "y", status: "queued" })] }));
    mount();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getByText("Queued — waiting for a free slot")).toBeInTheDocument();
  });

  it("shows a skeleton while loading, and an error with Retry (AC-D70, AC-D71)", () => {
    state = { isLoading: true, isError: false, refetch: vi.fn() };
    const { unmount } = mount();
    expect(screen.getByTestId("agent-eval-skeleton")).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    state = { isLoading: false, isError: true, refetch };
    mount();
    fireEvent.click(within(document.body).getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the agent name and failure reasons as literal text (AC-D95)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    state = ok(
      makeAgentDashboard({
        agent: { id: "ag1", name: evil, model: "m" },
        runs: [makeRun({ id: "f", status: "failed", error: evil, metrics: null, counts: null })],
      }),
    );
    const { container } = mount();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThanOrEqual(2);
  });
});
