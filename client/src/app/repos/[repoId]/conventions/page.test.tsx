import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";
import { ToastProvider } from "../../../../lib/toast";

const extractMutate = vi.fn();
const updateMutate = vi.fn();
const removeMutate = vi.fn();
const draftMutate = vi.fn();
let candidates: ConventionCandidate[] = [];

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api", default_branch: "main" }] }),
}));
vi.mock("../../../../lib/hooks/conventions", () => ({
  useConventions: () => ({ data: candidates, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteConvention: () => ({ mutate: removeMutate, isPending: false }),
  useConventionSkillDraft: () => ({ mutate: draftMutate, isPending: false }),
}));

import ConventionsPage from "./page";

afterEach(() => {
  cleanup();
  extractMutate.mockReset();
  updateMutate.mockReset();
  removeMutate.mockReset();
  draftMutate.mockReset();
  candidates = [];
});

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  category: "styling",
  rule: "Styles live in styles.ts",
  rationale: null,
  evidence_path: "src/a.ts",
  evidence_line: 3,
  evidence_snippet: "export const s = {",
  occurrences: 12,
  confidence: 0.9,
  status: "pending",
  created_at: "2026-09-23T00:00:00.000Z",
  ...over,
});

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionsPage />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConventionsPage", () => {
  it("names the repo being scanned", () => {
    renderPage();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
  });

  it("offers Run Scan and Re-scan as TWO distinct buttons", () => {
    renderPage();
    // The empty state repeats the Run Scan CTA, so the header one is the first.
    expect(screen.getAllByRole("button", { name: "Run Scan" })[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
  });

  it("enables Run Scan but not Re-scan before anything has been scanned", () => {
    renderPage();
    // "Run Scan" also appears on the empty state's CTA; the header one is first.
    expect(screen.getAllByRole("button", { name: "Run Scan" })[0]).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeDisabled();
  });

  it("flips which scan button is live once results exist", () => {
    candidates = [c()];
    renderPage();
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-scan" })).not.toBeDisabled();
  });

  it("runs a scan on demand — never on mount, because it costs a model call", () => {
    renderPage();
    expect(extractMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Run Scan" })[0]!);
    expect(extractMutate).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("shows the empty state before the first scan", () => {
    renderPage();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
  });

  it("renders a card per candidate with its triage filters and counts", () => {
    candidates = [c(), c({ id: "c2", status: "accepted" }), c({ id: "c3", status: "rejected" })];
    renderPage();
    expect(screen.getByText("3 candidates · grounded against sampled files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All \d/ })).toBeInTheDocument();
    expect(screen.getAllByText("Styles live in styles.ts")).toHaveLength(3);
  });

  it("narrows the board to one status when a filter chip is clicked", () => {
    candidates = [c(), c({ id: "c2", rule: "Accepted rule", status: "accepted" })];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Accepted \d/ }));
    expect(screen.getByText("Accepted rule")).toBeInTheDocument();
    expect(screen.queryByText("Styles live in styles.ts")).not.toBeInTheDocument();
  });

  it("hides Create skill until something is accepted", () => {
    candidates = [c()];
    renderPage();
    expect(screen.queryByRole("button", { name: /Create skill/ })).not.toBeInTheDocument();
  });

  it("offers Create skill once a candidate is accepted, and drafts on click", () => {
    candidates = [c({ status: "accepted" })];
    renderPage();
    const btn = screen.getByRole("button", { name: /Create skill/ });
    fireEvent.click(btn);
    expect(draftMutate).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("persists a reject through the API rather than only in local state", () => {
    candidates = [c()];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } });
  });
});
