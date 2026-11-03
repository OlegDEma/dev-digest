import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboardOverview } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import dashMessages from "../../../../../messages/en/evalDashboard.json";
import { makeRun } from "@/lib/test-support/eval-fixtures";
import { formatWhen } from "@/lib/eval-format";

type Q = { data?: EvalDashboardOverview; isLoading: boolean; isError: boolean; refetch: () => void };
let state: Q;
const push = vi.fn();
const mutate = vi.fn();
let batch: { isPending: boolean; isError: boolean; error: Error | null; mutate: typeof mutate };
vi.mock("@/lib/hooks/evals", () => ({ useEvalDashboard: () => state }));
let watching = 0;
let watchedIds: readonly string[] = [];
vi.mock("@/lib/hooks/eval-dashboards", () => ({
  useStartEvalBatch: () => batch,
  useWatchEvalRuns: (ids: readonly string[]) => {
    watchedIds = ids;
    return ids.length ? watching : 0;
  },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { EvalDashboard } from "./EvalDashboard";

beforeEach(() => {
  watching = 0;
  watchedIds = [];
  batch = { isPending: false, isError: false, error: null, mutate };
});
afterEach(() => {
  cleanup();
  push.mockReset();
  mutate.mockReset();
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages, evalDashboard: dashMessages }}>
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
  sparkline: [] as number[],
  last_full_run: makeRun() as ReturnType<typeof makeRun> | null,
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

  it("renders a row per agent with name, model chip, last run, R/P/C and a link to its page (AC-D61, AC-D63)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mount();
    const row = screen.getByTestId("agent-row");
    expect(within(row).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(row).getByText("gpt-4.1")).toBeInTheDocument();
    expect(row).toHaveTextContent(`Last run v1 · ${formatWhen("2026-10-01T10:00:00.000Z")} · 6/8 pass`);
    expect(row).toHaveTextContent("R66%");
    expect(row).toHaveTextContent("P80%");
    expect(row).toHaveTextContent("C90%");
    expect(row).toHaveAttribute("href", "/eval/ag1");
  });

  it("hides the sparkline under two full runs and shows it from two (AC-D62)", () => {
    state = ok({ agents: [agent({ sparkline: [0.5] })], recent_runs: [] });
    const { unmount } = mount();
    expect(screen.queryByRole("img")).toBeNull();
    unmount();
    state = ok({ agents: [agent({ sparkline: [0.5, 0.7] })], recent_runs: [] });
    mount();
    expect(screen.getByRole("img", { name: "Recall trend, 2 runs" })).toBeInTheDocument();
  });

  it("shows 'No full runs yet' on an agent without a finished full run", () => {
    state = ok({ agents: [agent({ last_full_run: null })], recent_runs: [] });
    mount();
    expect(within(screen.getByTestId("agent-row")).getByText("No full runs yet")).toBeInTheDocument();
  });

  it("renders null metrics as a dash (AC-41c)", () => {
    state = ok({
      agents: [agent({ last_full_run: makeRun({ metrics: { recall: null, precision: null, strict_precision: null, citation_accuracy: null, macro_recall: null, macro_precision: null } }) })],
      recent_runs: [],
    });
    mount();
    expect(screen.getByTestId("agent-row")).toHaveTextContent("R—");
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
    expect(rows[0]).toHaveTextContent("80%");
    expect(rows[0]).toHaveTextContent("6/8");
    expect(rows[0]).toHaveTextContent("done");
  });

  it("shows partial status in recent runs", () => {
    state = ok({ agents: [agent()], recent_runs: [makeRun({ status: "partial" })] });
    mount();
    expect(screen.getByTestId("recent-run-row")).toHaveTextContent("partial");
  });

  it("opens the agent's eval page when a recent-run row is clicked (AC-D63)", () => {
    state = ok({ agents: [agent()], recent_runs: [makeRun()] });
    mount();
    fireEvent.click(screen.getByTestId("recent-run-row"));
    expect(push).toHaveBeenCalledWith("/eval/ag1");
  });

  it("draws recent-run metrics as bars with their value as text, in colour bands (AC-D64)", () => {
    state = ok({ agents: [agent()], recent_runs: [makeRun({ metrics: { recall: 0.9, precision: 0.6, strict_precision: null, citation_accuracy: 0.2, macro_recall: null, macro_precision: null } })] });
    const { container } = mount();
    const row = screen.getByTestId("recent-run-row");
    expect(row).toHaveTextContent("90%");
    expect(row).toHaveTextContent("60%");
    expect(row).toHaveTextContent("20%");
    const fills = Array.from(container.querySelectorAll<HTMLElement>("tbody div[style*='width: ']")).map((el) => el.style.background);
    expect(fills).toEqual(expect.arrayContaining(["var(--ok)", "var(--warn)", "var(--crit)"]));
  });

  it("confirms Run all agents with eligible agents, case counts, total reviews and skipped names, then makes one batch call (AC-D73, AC-D74)", () => {
    state = ok({
      agents: [
        agent({ agent_id: "a1", name: "Alpha", cases_total: 3 }),
        agent({ agent_id: "a2", name: "Beta", cases_total: 4 }),
        agent({ agent_id: "a3", name: "Gamma", cases_total: 5, enabled: false }),
        agent({ agent_id: "a4", name: "Delta", cases_total: 0 }),
      ],
      recent_runs: [],
    });
    mount();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Alpha · 3 cases");
    expect(dialog).toHaveTextContent("Beta · 4 cases");
    expect(dialog).toHaveTextContent("7 reviews in total");
    expect(dialog).toHaveTextContent("Skipped: Gamma, Delta");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start 2 runs" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("disables the start button while the batch call is pending (AC-D74)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    batch = { ...batch, isPending: true };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Starting…" })).toBeDisabled();
  });

  it("lists started, queued and skipped — reason after the batch answers (AC-D76)", async () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mutate.mockImplementation((_v, o) =>
      o.onSuccess({
        started: [{ agent_id: "a1", agent_name: "Alpha", run_id: "r1", cases: 3 }],
        queued: [{ agent_id: "a2", agent_name: "Beta", run_id: "r2", cases: 4 }],
        skipped: [{ agent_id: "a3", agent_name: "Gamma", reason: "provider_not_configured" }],
      }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    fireEvent.click(screen.getByRole("button", { name: "Start 1 run" }));
    const res = await screen.findByTestId("batch-result");
    expect(res).toHaveTextContent("Started");
    expect(res).toHaveTextContent("Alpha · 3 cases");
    expect(res).toHaveTextContent("Queued");
    expect(res).toHaveTextContent("Beta · 4 cases");
    expect(res).toHaveTextContent("Gamma — provider key is not configured");
  });

  it("watches the runs a batch started and shows how many are still running (AC-D76)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    mutate.mockImplementation((_v, o) =>
      o.onSuccess({
        started: [{ agent_id: "a1", agent_name: "Alpha", run_id: "r1", cases: 3 }],
        queued: [{ agent_id: "a2", agent_name: "Beta", run_id: "r2", cases: 4 }],
        skipped: [],
      }),
    );
    watching = 2;
    mount();
    expect(screen.queryByText("2 runs still running…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    fireEvent.click(screen.getByRole("button", { name: "Start 1 run" }));
    expect(watchedIds).toEqual(["r1", "r2"]);
    expect(screen.getByText("2 runs still running…")).toBeInTheDocument();
  });

  it("shows the request error with Retry that calls the batch again (AC-D78a)", () => {
    state = ok({ agents: [agent()], recent_runs: [] });
    batch = { ...batch, isError: true, error: new Error("boom") };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not start the batch: boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mutate).toHaveBeenCalledTimes(1);
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
