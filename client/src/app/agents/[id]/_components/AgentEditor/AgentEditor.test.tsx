import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import ciMessages from "../../../../../../messages/en/ci.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

const idle = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
vi.mock("../../../../../lib/hooks/evals", () => ({
  useAgentEvalCases: () => idle,
  useAgentEvalRuns: () => idle,
  useEvalRun: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useStartEvalRun: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock("../../../../../lib/hooks/ci", () => ({
  useCiInstallations: () => ({ data: [], isLoading: false, isError: false }),
  useExportCi: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
}));
vi.mock("../../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [], isLoading: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages, ci: ciMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("lists the Evals tab right after Context and CI right after Evals (AC-14a, AC-B1)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const names = screen.getAllByRole("button").slice(0, 5).map((el) => el.textContent?.trim());
    expect(names).toEqual(["Config", "Skills", "Context", "Evals", "CI"]);
  });

  it("renders the Evals tab content for tab=evals (AC-14a)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Run all evals (0)" })).toBeInTheDocument();
    expect(screen.getByText("Eval cases")).toBeInTheDocument();
  });

  it("renders the CI tab content for tab=ci (AC-B1)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="ci" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Continuous Integration" })).toBeInTheDocument();
  });

  it("selects the Evals tab through onTab", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledWith("evals");
  });
});
