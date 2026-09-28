import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  confidenceColor,
  confidencePct,
  countByStatus,
  evidenceLabel,
  evidenceUrl,
  filterCandidates,
} from "./helpers";

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  category: "structure",
  rule: "Rule",
  rationale: null,
  evidence_path: "src/a.ts",
  evidence_line: 3,
  evidence_snippet: "code",
  occurrences: null,
  confidence: 0.9,
  status: "pending",
  created_at: "2026-09-23T00:00:00.000Z",
  ...over,
});

describe("filterCandidates", () => {
  const list = [c(), c({ id: "c2", status: "accepted" }), c({ id: "c3", status: "rejected" })];

  it("shows everything under 'all'", () => {
    expect(filterCandidates(list, "all")).toHaveLength(3);
  });

  it("narrows to a single status", () => {
    expect(filterCandidates(list, "accepted").map((x) => x.id)).toEqual(["c2"]);
    expect(filterCandidates(list, "rejected").map((x) => x.id)).toEqual(["c3"]);
    expect(filterCandidates(list, "pending").map((x) => x.id)).toEqual(["c1"]);
  });
});

describe("countByStatus", () => {
  it("counts each triage bucket, with 'all' as the total", () => {
    const counts = countByStatus([c(), c({ id: "c2", status: "accepted" }), c({ id: "c3", status: "accepted" })]);
    expect(counts).toEqual({ all: 3, pending: 1, accepted: 2, rejected: 0 });
  });

  it("is all zeroes for an empty board", () => {
    expect(countByStatus([])).toEqual({ all: 0, pending: 0, accepted: 0, rejected: 0 });
  });
});

describe("confidence", () => {
  it("bands the colour at 85 / 65", () => {
    expect(confidenceColor(0.9)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.2)).toBe("var(--crit)");
  });

  it("renders a 0-1 score as a clamped percentage", () => {
    expect(confidencePct(0.915)).toBe(92);
    expect(confidencePct(1.4)).toBe(100);
    expect(confidencePct(-1)).toBe(0);
  });
});

describe("evidence links", () => {
  it("deep-links to the exact line on GitHub", () => {
    expect(evidenceUrl("acme/app", "main", "src/a.ts", 12)).toBe(
      "https://github.com/acme/app/blob/main/src/a.ts#L12",
    );
  });

  it("falls back to HEAD when the branch is unknown", () => {
    expect(evidenceUrl("acme/app", null, "src/a.ts", 1)).toContain("/blob/HEAD/");
  });

  it("omits the line anchor when there is no line", () => {
    expect(evidenceUrl("acme/app", "main", "src/a.ts", null)).toBe(
      "https://github.com/acme/app/blob/main/src/a.ts",
    );
  });

  it("returns null rather than a broken link when the repo is unknown", () => {
    expect(evidenceUrl(null, "main", "src/a.ts", 1)).toBeNull();
    expect(evidenceUrl("acme/app", "main", "", 1)).toBeNull();
  });

  it("labels evidence as path:line, or just the path", () => {
    expect(evidenceLabel("src/a.ts", 4)).toBe("src/a.ts:4");
    expect(evidenceLabel("src/a.ts", null)).toBe("src/a.ts");
  });
});
