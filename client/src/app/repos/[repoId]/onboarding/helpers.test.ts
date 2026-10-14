import { describe, it, expect } from "vitest";
import {
  isStale,
  middleTruncate,
  openFileUrl,
  relativeAgo,
  sanitizeAnnotation,
  skeletonCopyKey,
  statsParts,
  subtitleParts,
  topPercent,
  unavailableCopyKey,
} from "./helpers";
import { indexSummary, narrativeTour, skeletonTour } from "./test-utils";

describe("subtitleParts / statsParts", () => {
  it("returns X and Y, with Y null when unknown (AC-8, AC-9)", () => {
    expect(subtitleParts(narrativeTour())).toEqual({ indexed: 5000, total: 12450 });
    expect(subtitleParts(narrativeTour({ index: indexSummary({ source_files_total: null }) })).total).toBeNull();
  });

  it("sums tokens, formats cost to 4 decimals and keeps the model (AC-10)", () => {
    const t = narrativeTour();
    expect(statsParts(t.llm, t.mode)).toMatchObject({ calls: 1, tokens: 7200, cost: "0.0123", model: "gpt-4o-mini", attempts: null });
  });

  it("shows calls only for a skeleton (AC-11)", () => {
    const t = skeletonTour("no_clone");
    expect(statsParts(t.llm, t.mode)).toMatchObject({ calls: 0, callsOnly: true, tokens: null, cost: null, model: null });
  });

  it("reports unknown cost as null and attempts only above 1 (AC-12, AC-13)", () => {
    const t = narrativeTour();
    expect(statsParts({ ...t.llm, cost_usd: null }, "narrative").cost).toBeNull();
    expect(statsParts({ ...t.llm, attempts: 3 }, "narrative").attempts).toBe(3);
  });
});

describe("row formatters", () => {
  it("topPercent is max(1, 100 - percentile) (AC-51)", () => {
    expect(topPercent(98)).toBe(2);
    expect(topPercent(100)).toBe(1);
    expect(topPercent(40)).toBe(60);
  });

  it("middleTruncate keeps both ends of a long path (AC-63)", () => {
    const p = `src/${"a/".repeat(100)}file.ts`;
    const out = middleTruncate(p, 40);
    expect(out.length).toBe(40);
    expect(out.startsWith("src/")).toBe(true);
    expect(out.endsWith("file.ts")).toBe(true);
    expect(out).toContain("…");
    expect(middleTruncate("src/a.ts", 40)).toBe("src/a.ts");
  });

  it("sanitizeAnnotation yields one line of at most 80 characters (AC-59)", () => {
    expect(sanitizeAnnotation("start\n rm -rf /\r\tnow\u0007x")).toBe("start rm -rf / now x");
    const long = sanitizeAnnotation("x".repeat(200));
    expect(long.length).toBe(80);
  });

  it("openFileUrl pins the SHA, else the default branch (AC-57)", () => {
    expect(openFileUrl("a/b", "abc", "main", "src/x y.ts")).toBe("https://github.com/a/b/blob/abc/src/x%20y.ts");
    expect(openFileUrl("a/b", null, "main", "src/x.ts")).toBe("https://github.com/a/b/blob/main/src/x.ts");
  });
});

describe("state helpers", () => {
  it("isStale compares the current and the tour's indexed SHA (AC-20)", () => {
    const tour = narrativeTour();
    expect(isStale(indexSummary({ last_indexed_sha: "zzz" }), tour)).toBe(true);
    expect(isStale(indexSummary(), tour)).toBe(false);
  });

  it("skeletonCopyKey addresses the reason's text group", () => {
    expect(skeletonCopyKey("llm_timeout")).toBe("skeleton.reasons.llm_timeout");
  });

  it("unavailableCopyKey maps known states and returns null for unknown ones (AC-53, AC-77, D19)", () => {
    const skel = skeletonTour("no_clone");
    const tasks = skel.sections[4]!;
    expect(unavailableCopyKey(tasks, skel)).toBe("unavailable.firstTasksSkeleton");
    const narrative = narrativeTour();
    expect(unavailableCopyKey({ ...narrative.sections[4]!, available: false }, narrative)).toBe("unavailable.firstTasksTooFew");
    expect(unavailableCopyKey({ ...narrative.sections[1]!, available: false }, skeletonTour("index_unavailable"))).toBe("unavailable.indexUnavailable");
    expect(unavailableCopyKey({ ...narrative.sections[2]!, available: false }, skel)).toBe("unavailable.noClone");
    expect(unavailableCopyKey({ ...narrative.sections[0]!, available: false }, narrative)).toBeNull();
    expect(unavailableCopyKey(narrative.sections[0]!, narrative)).toBeNull();
  });

  it("relativeAgo words the elapsed time", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    expect(relativeAgo("2026-10-11T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeAgo("2026-10-09T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeAgo("garbage", now)).toBe("—");
  });
});
