/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

let fseq = 0;
function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  fseq += 1;
  return {
    id: `f${fseq}`,
    review_id: "rv1",
    severity: "CRITICAL",
    category: "security",
    title: "A finding",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("a settled run shows total tokens and cost near the timestamp", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013, findings_count: 0, blockers: 0, score: 90 })]);
    expect(screen.getByText(/9,119 tok · \$0\.001300/)).toBeInTheDocument();
  });

  it("a settled run with unknown cost shows an em dash, not a fake price", () => {
    renderRuns([run({ status: "done", tokens_in: 100, tokens_out: 50, cost_usd: null, findings_count: 0, blockers: 0, score: 90 })]);
    expect(screen.getByText(/150 tok · —/)).toBeInTheDocument();
  });
});

describe("RunHistory — findings breakdown + hover", () => {
  it("shows a severity breakdown (from findings) + blockers, and reveals detail on hover", () => {
    const runId = "run-77";
    const findingsByRun = new Map<string, FindingRecord[]>([
      [
        runId,
        [
          finding({ id: "a", severity: "CRITICAL", title: "Hardcoded Stripe secret key" }),
          finding({ id: "b", severity: "CRITICAL" }),
          finding({ id: "c", severity: "WARNING" }),
        ],
      ],
    ]);
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ run_id: runId, status: "done", findings_count: 3, blockers: 2, score: 38 })]}
          findingsByRun={findingsByRun}
          repoFullName="acme/payments-api"
          headSha="abc1234"
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );

    // Chips derive from the findings themselves (3 total), blockers from the row.
    expect(screen.getByLabelText("3 findings")).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();

    // Hover the chips → the card lists the findings.
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });

  it("falls back to the plain findings-count text when no findings are mapped", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    // No findingsByRun prop → text fallback, no hover-card trigger.
    expect(screen.getByText(/3 finding/)).toBeInTheDocument();
    expect(document.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  });
});
