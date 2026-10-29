import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NAV } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/ci.json";
import { formatRanAt } from "./helpers";

type Q = { data?: CiRun[]; isLoading: boolean; isError: boolean; refetch: () => void };
let runs: Q;
let refresh: Record<string, unknown>;
const refreshMutate = vi.fn();
vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: () => runs,
  useRefreshCiRuns: () => ({ ...refresh, mutate: refreshMutate }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { CiRunsTable } from "./CiRunsTable";

const run = (over: Partial<CiRun> = {}): CiRun => ({
  id: "c1",
  ci_installation_id: "i1",
  pr_number: 42,
  ran_at: "2026-10-02T10:00:00.000Z",
  status: "succeeded",
  findings_count: 3,
  cost_usd: 0.0123,
  github_url: "https://github.com/acme/api/actions/runs/1",
  source: "acme/<i>api</i>",
  ...over,
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsTable />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  runs = { data: [run()], isLoading: false, isError: false, refetch: vi.fn() };
  refresh = { isPending: false, isError: false, data: undefined };
});
afterEach(() => {
  cleanup();
  refreshMutate.mockReset();
});

describe("CI Runs (V62)", () => {
  it("adds CI Runs to the sidebar after Eval Dashboard (AC-B13a)", () => {
    const keys = NAV.flatMap((g) => g.items).map((i) => i.key);
    expect(keys.indexOf("ci-runs")).toBe(keys.indexOf("eval") + 1);
    expect(NAV.flatMap((g) => g.items).find((i) => i.key === "ci-runs")).toMatchObject({ label: "CI Runs", href: "/ci-runs" });
  });

  it("renders the table columns and rows as plain text (AC-B13b, AC-64)", () => {
    mount();
    for (const h of ["Timestamp", "Pull request", "Source", "Findings", "Cost", "Status"]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(formatRanAt("2026-10-02T10:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("acme/<i>api</i>")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "https://github.com/acme/api/actions/runs/1");
  });

  it("shows the empty state (AC-B13b)", () => {
    runs = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    mount();
    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
  });

  it("refreshes, and shows Refreshing… while in progress (AC-B14b)", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refreshMutate).toHaveBeenCalled();
    cleanup();
    refresh = { isPending: true, isError: false, data: undefined };
    mount();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });

  it("shows the refresh error (AC-B15b)", () => {
    refresh = { isPending: false, isError: true, error: new Error("GitHub read failed <b>x</b>") };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub read failed <b>x</b>");
  });

  it("shows the skipped-artifacts count with ICU plural (AC-B16b)", () => {
    refresh = { isPending: false, isError: false, data: { ingested: 1, skipped: 2 } };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("2 artifacts skipped (invalid format)");
    cleanup();
    refresh = { isPending: false, isError: false, data: { ingested: 1, skipped: 1 } };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("1 artifact skipped (invalid format)");
  });
});
