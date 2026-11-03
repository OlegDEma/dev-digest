import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const refetch = vi.fn();
let state: { data?: AgentStats; isLoading: boolean; isError: boolean };

vi.mock("../../../../../../../lib/hooks/agent-stats", () => ({
  useAgentStats: () => ({ ...state, refetch }),
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  refetch.mockReset();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  runs: 12,
  findings_total: 20,
  accepted: 6,
  dismissed: 2,
  pending: 12,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  avg_findings_per_run: 1.7,
  total_cost_usd: 0.6,
  avg_cost_usd: 0.05,
  avg_latency_ms: 2400,
  findings_by_severity: { CRITICAL: 3, WARNING: 9, SUGGESTION: 8 },
  trend: [],
};

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <StatsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("agent StatsTab", () => {
  it("shows the six tiles labelled last 30 days (AC-D89)", () => {
    state = { data: STATS, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByText("last 30 days")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Runs")).toHaveTextContent("12");
    expect(screen.getByTestId("stat-Accept %")).toHaveTextContent("75");
    expect(screen.getByTestId("stat-Dismiss %")).toHaveTextContent("25");
    expect(screen.getByTestId("stat-Avg cost")).toHaveTextContent("$0.05");
    expect(screen.getByTestId("stat-Avg latency")).toHaveTextContent("2.4 s");
    expect(screen.getByText("Findings by severity")).toBeInTheDocument();
    expect(screen.getByText("Critical").previousSibling).toHaveTextContent("3");
    expect(screen.getByText("Warning").previousSibling).toHaveTextContent("9");
    expect(screen.getByText("Suggestion").previousSibling).toHaveTextContent("8");
  });

  it("shows 0 runs and — for every ratio and mean when there are no runs (AC-D90)", () => {
    state = {
      data: {
        ...STATS,
        runs: 0,
        accept_rate: null,
        dismiss_rate: null,
        avg_cost_usd: null,
        avg_latency_ms: null,
        findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      },
      isLoading: false,
      isError: false,
    };
    renderTab();
    expect(screen.getByTestId("stat-Runs")).toHaveTextContent("0");
    for (const l of ["Accept %", "Dismiss %", "Avg cost", "Avg latency"]) {
      expect(screen.getByTestId(`stat-${l}`)).toHaveTextContent("—");
    }
  });

  it("shows skeleton tiles while loading (AC-D91a)", () => {
    state = { data: undefined, isLoading: true, isError: false };
    renderTab();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByTestId("stat-Runs")).not.toBeInTheDocument();
  });

  it("shows an error with Retry that refetches (AC-D91b)", () => {
    state = { data: undefined, isLoading: false, isError: true };
    renderTab();
    expect(screen.getByText("Could not load stats.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
