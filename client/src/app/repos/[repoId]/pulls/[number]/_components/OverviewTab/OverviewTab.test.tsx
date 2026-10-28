import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, PrIntentRecord } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";

const state = vi.hoisted(() => ({
  brief: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  gen: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
  info: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks/brief", () => ({
  usePrBrief: () => state.brief,
  useGenerateBrief: () => state.gen,
}));
vi.mock("../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: { intent: INTENT, stale: false }, isLoading: false, isError: false }),
  useRecomputeIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/blast", () => ({
  usePrBlast: () => ({ data: undefined, isPending: true, isError: false }),
  blastQueryKey: (id: string) => ["pull-blast", id],
}));
vi.mock("../../../../../../../lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/history", () => ({
  usePrHistory: () => ({ data: { history: [], available: true, reason: null }, isLoading: false, isError: false }),
}));
vi.mock("../../../../../../../lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: state.info },
}));

import { OverviewTab } from "./OverviewTab";

const INTENT = {
  pr_id: "p1",
  summary: "Intent summary text",
  in_scope: [],
  out_of_scope: [],
  risk_areas: [{ label: "Intent chip", kind: "api" }],
  missing_context: [],
  confidence: "high",
  head_sha: "abc",
  sources: [],
  model: "m",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0,
  diff_tokens_saved: 0,
  computed_at: "2026-09-30T00:00:00Z",
} as PrIntentRecord;

const full: PrBrief = {
  intent: null,
  blast: null,
  risks: {
    risks: [
      { kind: "security", title: "Leak", explanation: "x", severity: "high", file_refs: ["src/config.ts:10-20", "src/caller.ts:7"] },
    ],
  },
  history: null,
  summary: "Brief summary text",
  review_focus: [{ file: "src/config.ts", line: 12, reason: "Secret", source: "pr_diff", line_corrected: false }],
  head_sha: "abcdef123456",
  generated_at: "2026-10-12T10:00:00Z",
  provider: "openai",
  model: "gpt-x",
  calls: 1,
  attempts: 1,
  input_tokens: 10,
  input_budget: 8000,
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: null,
  missing_inputs: [],
  specs: [],
  reductions: [],
  dropped: { risks: 0, risk_refs: 0, review_focus: 0 },
  corrected_lines: 0,
};

afterEach(cleanup);
beforeEach(() => {
  state.brief = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  state.gen = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.info.mockClear();
});

function renderTab(onOpenFile = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
    <NextIntlClientProvider locale="en" messages={{ brief, blast }}>
      <OverviewTab
        prId="p1"
        repoId="r1"
        repoFullName="o/r"
        headSha="abc"
        pollWhileRunning={false}
        prBody="PR description"
        changedPaths={["src/config.ts"]}
        onOpenFile={onOpenFile}
      />
    </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenFile;
}

describe("OverviewTab", () => {
  it("AC-1/AC-44: without a brief it offers Generate and keeps the intent list", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
    expect(screen.getByText("Intent chip")).toBeInTheDocument();
    expect(screen.queryByText("Review focus — read these first")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(state.gen.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-6: a brief GET failure keeps the Intent card and Description", () => {
    state.brief = { ...state.brief, isError: true, error: new Error("boom") };
    renderTab();
    expect(screen.getByText("Could not load the brief")).toBeInTheDocument();
    expect(screen.getByText(/Intent summary text/)).toBeInTheDocument();
    expect(screen.getByText("PR description")).toBeInTheDocument();
  });

  it("AC-4: first generation shows skeletons for risks and focus", () => {
    state.gen = { ...state.gen, isPending: true };
    renderTab();
    expect(screen.getByTestId("brief-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("risks-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("focus-skeleton")).toBeInTheDocument();
  });

  it("AC-43: with a brief, Risk areas replace the intent chips and Review focus appears", () => {
    state.brief = { ...state.brief, data: { brief: full, stale: false } };
    renderTab();
    expect(screen.getByText("Brief summary text")).toBeInTheDocument();
    expect(screen.getByText("Leak")).toBeInTheDocument();
    expect(screen.queryByText("Intent chip")).not.toBeInTheDocument();
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
  });

  it("AC-51/AC-56: changed-file focus item and risk ref call onOpenFile(path, line)", () => {
    state.brief = { ...state.brief, data: { brief: full, stale: false } };
    const open = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts line 12 in Files changed" }));
    expect(open).toHaveBeenLastCalledWith("src/config.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts line 10 in Files changed" }));
    expect(open).toHaveBeenLastCalledWith("src/config.ts", 10);
    expect(state.info).not.toHaveBeenCalled();
  });

  it("AC-55: a blast-only ref stays on Overview and notifies File not in this PR’s diff", () => {
    state.brief = { ...state.brief, data: { brief: full, stale: false } };
    const open = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Show details: Leak" }));
    fireEvent.click(screen.getByRole("button", { name: "Open src/caller.ts line 7 in Files changed" }));
    expect(open).not.toHaveBeenCalled();
    expect(state.info).toHaveBeenCalledWith("File not in this PR’s diff");
  });
});
