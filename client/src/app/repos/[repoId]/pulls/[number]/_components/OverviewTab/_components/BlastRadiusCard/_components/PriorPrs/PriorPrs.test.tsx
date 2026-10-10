import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false },
}));
vi.mock("../../../../../../../../../../../lib/hooks/history", () => ({ usePrHistory: () => state.query }));

import { PriorPrs } from "./PriorPrs";

afterEach(cleanup);
beforeEach(() => {
  state.query = { data: undefined, isLoading: false, isError: false };
});

const item = (n: number) => ({
  pr_number: n,
  title: `title ${n}`,
  merged_at: "2026-02-01T00:00:00Z",
  author: "octo",
  files_overlap: ["a.ts", "b.ts"],
  notes: "",
});

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrs prId="p1" repoFullName="OlegDEma/dev-digest" enabled />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrs", () => {
  it("collapsed shows title and count; expanding lists linked PRs with overlap", () => {
    state.query = { data: { history: [item(3), item(4), item(5)], available: true, reason: null }, isLoading: false, isError: false };
    renderFooter();
    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "https://github.com/OlegDEma/dev-digest/pull/3");
    expect(links[0]).toHaveTextContent("#3 title 3");
    expect(screen.getAllByText(/2 files overlap/)).toHaveLength(3);
  });

  it("empty history", () => {
    state.query = { data: { history: [], available: true, reason: null }, isLoading: false, isError: false };
    renderFooter();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No prior merged PRs touch these files.")).toBeInTheDocument();
  });

  it("unavailable (no token) and query error both say so", () => {
    state.query = { data: { history: [], available: false, reason: "no_token" }, isLoading: false, isError: false };
    renderFooter();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Prior PRs unavailable")).toBeInTheDocument();
    cleanup();

    state.query = { data: undefined, isLoading: false, isError: true };
    renderFooter();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Prior PRs unavailable")).toBeInTheDocument();
  });
});
