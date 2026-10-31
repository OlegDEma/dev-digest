import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
const deleteMutate = vi.fn();
vi.mock("../../../../lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { AgentCard } from "./AgentCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_docs: [],
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  runs: 12,
  findings_total: 8,
  accepted: 3,
  dismissed: 1,
  pending: 4,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  avg_findings_per_run: 0.7,
  total_cost_usd: 0.6,
  avg_cost_usd: 0.05,
  avg_latency_ms: 1000,
  findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 5 },
  trend: [],
};

describe("AgentCard stats line", () => {
  it("shows runs, accept and avg cost (AC-D87)", () => {
    renderWithIntl(<AgentCard ag={AGENT} stats={STATS} statsState="ready" />);
    expect(screen.getByText("12 runs · 75% accept · $0.05 avg")).toBeInTheDocument();
  });

  it("shows — for null values (AC-D87)", () => {
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        stats={{ ...STATS, runs: 0, accept_rate: null, avg_cost_usd: null }}
        statsState="ready"
      />,
    );
    expect(screen.getByText("0 runs · — accept · — avg")).toBeInTheDocument();
  });

  it("shows a placeholder while loading (AC-D88a)", () => {
    renderWithIntl(<AgentCard ag={AGENT} statsState="loading" />);
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("hides the line on error but keeps the rest of the card (AC-D88b)", () => {
    renderWithIntl(<AgentCard ag={AGENT} statsState="error" />);
    expect(screen.queryByText(/accept/)).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
  });
});

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("Delete opens a confirmation dialog rather than deleting outright", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Delete agent "Security Reviewer"\?/);
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("cancelling the confirmation deletes nothing", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("confirming deletes the agent", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete agent" }));
    expect(deleteMutate).toHaveBeenCalledWith("ag1", expect.any(Object));
  });

  it("a click on the card does not fire while the dialog is open", () => {
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    onClick.mockReset();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
