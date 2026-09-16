import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

// PRRow navigates on click; stub the router so it renders without Next context.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc1234",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-09-15T09:00:00.000Z",
    updated_at: "2026-09-15T09:00:00.000Z", // real date → UPDATED never renders "—"
    score: 61,
    cost_usd: 0.014,
    // non-null so the findings cell shows chips (not "—") in the cost tests
    findings_by_severity: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 },
    ...o,
  };
}

function renderRow(p: PrMeta) {
  // The findings cell lazily uses usePrReviews → needs a QueryClient in scope
  // (the query stays disabled until the hover card opens, so no fetch fires).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={p} repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("renders the formatted cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014000")).toBeInTheDocument();
  });

  it("renders an em dash (not a fake price) when cost is null", () => {
    renderRow(pr({ cost_usd: null }));
    // UPDATED has a real date, SCORE is non-null, findings has chips → the only
    // "—" is the cost cell.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PRRow — findings cell", () => {
  it("renders severity chips when findings_by_severity is present", () => {
    renderRow(pr({ findings_by_severity: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 } }));
    expect(screen.getByLabelText("6 findings")).toBeInTheDocument();
  });

  it("renders an em dash when findings_by_severity is null", () => {
    // cost non-null, score non-null, updated real → the only "—" is findings.
    renderRow(pr({ findings_by_severity: null, cost_usd: 0.014 }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
