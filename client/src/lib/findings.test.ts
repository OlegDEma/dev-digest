import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import {
  severityCounts,
  totalFindings,
  findingsByRun,
  currentFindings,
  emptySeverityCounts,
} from "./findings";

let seq = 0;
function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    review_id: "rv1",
    severity: "WARNING",
    category: "bug",
    title: "A finding",
    file: "src/x.ts",
    start_line: 10,
    end_line: 10,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "agent-sec",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 40,
    model: "m",
    grounding: null,
    created_at: "2026-06-13T08:00:00.000Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

describe("severityCounts", () => {
  it("tallies by severity and ignores unknown severities", () => {
    const counts = severityCounts([
      finding({ severity: "CRITICAL" }),
      finding({ severity: "CRITICAL" }),
      finding({ severity: "WARNING" }),
      finding({ severity: "SUGGESTION" }),
      finding({ severity: "INFO" as FindingRecord["severity"] }), // not a data severity
    ]);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(totalFindings(counts)).toBe(4);
  });

  it("empty input → all zero", () => {
    expect(severityCounts([])).toEqual(emptySeverityCounts());
  });
});

describe("findingsByRun", () => {
  it("groups findings by run_id, excluding dismissed and de-duping", () => {
    const reviews = [
      review({
        id: "rvA",
        run_id: "runA",
        findings: [
          finding({ id: "a1", severity: "CRITICAL" }),
          finding({ id: "a2", dismissed_at: "2026-06-13T09:00:00.000Z" }), // excluded
        ],
      }),
      review({ id: "rvB", run_id: "runB", findings: [finding({ id: "b1" })] }),
    ];
    const map = findingsByRun(reviews);
    expect(map.get("runA")!.map((f) => f.id)).toEqual(["a1"]);
    expect(map.get("runB")!.map((f) => f.id)).toEqual(["b1"]);
  });

  it("unions two review rows (summary + review) that share a run_id", () => {
    const reviews = [
      review({ id: "sum", kind: "summary", run_id: "runX", findings: [] }),
      review({ id: "rev", kind: "review", run_id: "runX", findings: [finding({ id: "x1" })] }),
    ];
    expect(findingsByRun(reviews).get("runX")!.map((f) => f.id)).toEqual(["x1"]);
  });

  it("skips reviews with a null run_id", () => {
    const map = findingsByRun([review({ run_id: null, findings: [finding()] })]);
    expect(map.size).toBe(0);
  });
});

describe("currentFindings", () => {
  it("takes the latest review PER AGENT and unions their findings", () => {
    const reviews = [
      // security: an older + a newer review — only the newer counts
      review({
        id: "sec-old",
        agent_id: "sec",
        created_at: "2026-06-13T03:00:00.000Z",
        findings: [finding({ id: "old" })],
      }),
      review({
        id: "sec-new",
        agent_id: "sec",
        created_at: "2026-06-13T08:52:00.000Z",
        findings: [finding({ id: "sec1", severity: "CRITICAL" }), finding({ id: "sec2" })],
      }),
      // performance: single review, different agent — additive across agents
      review({
        id: "perf",
        agent_id: "perf",
        created_at: "2026-06-13T08:52:14.000Z",
        findings: [finding({ id: "perf1", severity: "SUGGESTION" })],
      }),
    ];
    const ids = currentFindings(reviews)
      .map((f) => f.id)
      .sort();
    expect(ids).toEqual(["perf1", "sec1", "sec2"]); // NOT "old"
    expect(severityCounts(currentFindings(reviews))).toEqual({
      CRITICAL: 1,
      WARNING: 1,
      SUGGESTION: 1,
    });
  });

  it("ignores 'summary' reviews and dismissed findings", () => {
    const reviews = [
      review({ id: "sum", kind: "summary", findings: [finding({ id: "s1" })] }),
      review({
        id: "rev",
        kind: "review",
        findings: [
          finding({ id: "keep" }),
          finding({ id: "drop", dismissed_at: "2026-06-13T09:00:00.000Z" }),
        ],
      }),
    ];
    expect(currentFindings(reviews).map((f) => f.id)).toEqual(["keep"]);
  });
});
