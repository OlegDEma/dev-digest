import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboardOverview } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { makeRun } from "@/lib/test-support/eval-fixtures";
import { formatWhen } from "@/lib/eval-format";

type Q = { data?: EvalDashboardOverview; isLoading: boolean; isError: boolean; refetch: () => void };
let state: Q;
const push = vi.fn();
vi.mock("@/lib/hooks/evals", () => ({ useEvalDashboard: () => state }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { EvalDashboard } from "./EvalDashboard";

afterEach(() => {
  cleanup();
  push.mockReset();
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboard />
    </NextIntlClientProvider>,
  );

const ok = (data: EvalDashboardOverview): Q => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const agent = (over: Partial<EvalDashboardOverview["agents"][number]> = {}) => ({
  agent_id: "ag1",
  name: "Security Reviewer",
  model: "gpt-4.1",
  enabled: true,
  cases_total: 8,
  last_run: makeRun(),
  ...over,
});

describe("EvalDashboard", () => {
  it("shows the page heading (AC-55b context)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Eval Dashboard" })).toBeInTheDocument();
  });

  it("shows skeletons while loading (AC-58a)", () => {
    state = { isLoading: true, isError: false, refetch: vi.fn() };
    mount();
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
  });

  it("shows an error with Retry (AC-58b)", () => {
    const refetch = vi.fn();
    state = { isLoading: false, isError: true, refetch };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows 'No agents yet' for an empty workspace (AC-56b ii)", () => {
    state = ok({ agents: [], recent_runs: [] });
    mount();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
  });

  it("renders a card per agent with name, model, last run and metrics (AC-56a)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mount();
    const card = screen.getByTestId("agent-card");
    expect(within(card).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(card).getByText("gpt-4.1")).toBeInTheDocument();
    expect(card).toHaveTextContent(`v1 · ${formatWhen("2026-10-01T10:00:00.000Z")} · 6/8 passed`);
    expect(card).toHaveTextContent("RECALL66%");
    expect(card).toHaveTextContent("PRECISION80%");
    expect(card).toHaveTextContent("CITATION ACCURACY90%");
  });

  it("shows 'No runs yet' on an agent without a finished run (AC-56b i)", () => {
    state = ok({ agents: [agent({ last_run: null })], recent_runs: [] });
    mount();
    expect(within(screen.getByTestId("agent-card")).getByText("No runs yet")).toBeInTheDocument();
  });

  it("renders null metrics as a dash (AC-41c)", () => {
    state = ok({
      agents: [agent({ last_run: makeRun({ metrics: { recall: null, precision: null, strict_precision: null, citation_accuracy: null, macro_recall: null, macro_precision: null } }) })],
      recent_runs: [],
    });
    mount();
    expect(screen.getByTestId("agent-card")).toHaveTextContent("RECALL—");
  });

  it("links a card to the agent's Evals tab (AC-59)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mount();
    expect(screen.getByTestId("agent-card")).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("lists the 20 newest runs with the AC-57 columns", () => {
    const runs = Array.from({ length: 25 }, (_, i) =>
      makeRun({ id: `r${i}`, started_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), agent_name: `agent-${i}` }),
    );
    state = ok({ agents: [agent()], recent_runs: runs });
    mount();
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    for (const col of ["Agent", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Status"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    const rows = screen.getAllByTestId("recent-run-row");
    expect(rows).toHaveLength(20);
    expect(rows[0]).toHaveTextContent("agent-24");
    expect(rows[0]).toHaveTextContent("v1");
    expect(rows[0]).toHaveTextContent("66%");
    expect(rows[0]).toHaveTextContent("6/8");
    expect(rows[0]).toHaveTextContent("done");
  });

  it("shows partial status in recent runs", () => {
    state = ok({ agents: [agent()], recent_runs: [makeRun({ status: "partial" })] });
    mount();
    expect(screen.getByTestId("recent-run-row")).toHaveTextContent("partial");
  });

  it("opens the agent's Evals tab when a row is clicked (AC-59)", () => {
    state = ok({ agents: [agent()], recent_runs: [makeRun()] });
    mount();
    fireEvent.click(screen.getByTestId("recent-run-row"));
    expect(push).toHaveBeenCalledWith("/agents/ag1?tab=evals");
  });

  it("renders agent names and models as literal text (AC-64)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    state = ok({
      agents: [agent({ name: evil, model: evil })],
      recent_runs: [makeRun({ agent_name: evil })],
    });
    const { container } = mount();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThanOrEqual(2);
  });
});
