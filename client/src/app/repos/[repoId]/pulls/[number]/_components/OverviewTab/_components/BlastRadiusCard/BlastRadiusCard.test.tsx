import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBlastResponse } from "@devdigest/shared";
import blast from "../../../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../../../messages/en/brief.json";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isPending: false, isError: false },
  mutate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../../../../../../../../lib/hooks/blast", () => ({
  usePrBlast: () => state.query,
  blastQueryKey: (id: string) => ["pull-blast", id],
}));
vi.mock("../../../../../../../../../lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("../../../../../../../../../lib/hooks/history", () => ({
  usePrHistory: () => ({ data: { history: [], available: true, reason: null }, isLoading: false, isError: false }),
}));
vi.mock("../../../../../../../../../lib/toast", () => ({
  notify: { success: state.success, error: state.error },
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);
beforeEach(() => {
  state.query = { data: undefined, isPending: false, isError: false };
  state.mutate = vi.fn();
  state.success.mockClear();
  state.error.mockClear();
});

const base: PrBlastResponse = {
  changed_symbols: [
    { name: "getContext", file: "d.ts", kind: "function" },
    { name: "Lonely", file: "d.ts", kind: "type" },
  ],
  downstream: [
    {
      symbol: "getContext",
      callers: [{ name: "intentRoutes", file: "src/a.ts", line: 23 }],
      endpoints_affected: ["GET /x"],
      crons_affected: [],
      truncated: false,
    },
    { symbol: "Lonely", callers: [], endpoints_affected: [], crons_affected: [], truncated: false },
  ],
  summary: "2 changed symbols · 1 caller · 1 endpoint · 0 crons",
  counts: { symbols: 2, callers: 1, endpoints: 1, crons: 0 },
  degraded: false,
  reason: null,
  index_sha: "idx1",
  max_callers_per_symbol: 7,
  facts_by_file: { "src/a.ts": { endpoints: ["GET /x"], crons: [] } },
};

function renderCard(repoFullName: string | null = "acme/w") {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
        <BlastRadiusCard prId="p1" repoId="r1" repoFullName={repoFullName} headSha="head1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return spy;
}

describe("BlastRadiusCard", () => {
  it("shows title, counts, scope hint and tree rows, then switches to the graph", () => {
    state.query = { data: base, isPending: false, isError: false };
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("Direct callers (depth 1) · max 7 per symbol")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/a.ts:23" })).toHaveAttribute(
      "href",
      "https://github.com/acme/w/blob/idx1/src/a.ts#L23",
    );
    expect(screen.getByText("no callers")).toBeInTheDocument();
    expect(screen.queryByText("Incomplete index", { exact: false })).not.toBeInTheDocument();

    const title = screen.getByText("Blast radius");
    expect(title.closest("section")!.firstElementChild).toContainElement(title);
    expect(screen.getByRole("group", { name: "Blast radius view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /getContext\(\)/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Prior PRs touching these files/)).toBeInTheDocument();

    const tree = screen.getByRole("button", { name: "Tree" });
    const graph = screen.getByRole("button", { name: "Graph" });
    expect(tree).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(graph);
    expect(graph).toHaveAttribute("aria-pressed", "true");
    expect(tree).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "Blast radius graph" })).toBeInTheDocument();
  });

  it("keeps the title inside the card while loading and on error", () => {
    for (const q of [
      { data: undefined, isPending: true, isError: false },
      { data: undefined, isPending: false, isError: true },
    ]) {
      state.query = q;
      renderCard();
      const title = screen.getByText("Blast radius");
      expect(title.closest("section")!.firstElementChild).toContainElement(title);
      cleanup();
    }
  });

  it("uses plural stat labels", () => {
    state.query = {
      data: { ...base, counts: { symbols: 1, callers: 2, endpoints: 1, crons: 2 } },
      isPending: false,
      isError: false,
    };
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
          <BlastRadiusCard prId="p1" repoId="r1" repoFullName="acme/w" headSha="head1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("1 symbol");
    expect(text).not.toContain("1 symbols");
    expect(text).toContain("2 crons");
    expect(text).toContain("1 endpoint");
    expect(text).toContain("2 callers");
  });

  it("shows 10 symbol rows, then Show all N reveals the rest; only the first row is open", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      symbol: `sym${i}`,
      callers: [{ name: "fn", file: `src/f${i}.ts`, line: i + 1 }],
      endpoints_affected: [],
      crons_affected: [],
      truncated: false,
    }));
    state.query = {
      data: {
        ...base,
        changed_symbols: rows.map((r) => ({ name: r.symbol, file: "d.ts", kind: "function" })),
        downstream: rows,
        counts: { symbols: 12, callers: 12, endpoints: 0, crons: 0 },
      },
      isPending: false,
      isError: false,
    };
    renderCard();
    expect(screen.getAllByRole("button", { name: /sym\d+\(\)/ })).toHaveLength(10);
    expect(screen.getAllByRole("button", { expanded: true, name: /sym\d+\(\)/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getAllByRole("button", { name: /sym\d+\(\)/ })).toHaveLength(12);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("no downstream callers: explains it above the zero-caller rows", () => {
    state.query = {
      data: {
        ...base,
        downstream: base.downstream.map((g) => ({ ...g, callers: [], endpoints_affected: [] })),
        counts: { symbols: 2, callers: 0, endpoints: 0, crons: 0 },
      },
      isPending: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getAllByText("no callers")).toHaveLength(2);
  });

  it("Resync failure shows an error toast", () => {
    state.query = { data: { ...base, degraded: true, reason: "index_failed" }, isPending: false, isError: false };
    state.mutate = vi.fn((_v: unknown, opts: { onError: () => void }) => opts.onError());
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(state.error).toHaveBeenCalledWith("Could not start resync");
  });

  it("flag off / too large: badge only, no Resync button", () => {
    for (const reason of ["flag_off", "repo_too_large"] as const) {
      state.query = { data: { ...base, degraded: true, reason }, isPending: false, isError: false };
      renderCard();
      expect(screen.getByText(/Incomplete index/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Resync" })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("without a repo name, callers are plain text, not links", () => {
    state.query = { data: base, isPending: false, isError: false };
    renderCard(null);
    expect(screen.getByText("src/a.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/a.ts:23" })).not.toBeInTheDocument();
  });

  it("a query paused before it has data shows the skeleton, not an error", () => {
    state.query = { data: undefined, isPending: true, isError: false };
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.queryByText(/Could not|Something/i)).not.toBeInTheDocument();
  });

  it("no symbols declared", () => {
    state.query = {
      data: { ...base, changed_symbols: [], downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } },
      isPending: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByText("No symbols are declared in the changed files.")).toBeInTheDocument();
  });

  it("degraded: badge with reason; Resync toasts and invalidates the blast query", () => {
    state.query = { data: { ...base, degraded: true, reason: "index_partial" }, isPending: false, isError: false };
    state.mutate = vi.fn((_v: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
    const spy = renderCard();
    expect(screen.getByText("Incomplete index — partial index")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(state.success).toHaveBeenCalledWith("Resync started. The index refreshes in the background.");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pull-blast", "p1"] });
  });
});
