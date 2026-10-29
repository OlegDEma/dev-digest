import { describe, it, expect } from "vitest";
import type { EvalConfigSnapshot } from "@devdigest/shared";
import {
  caseSetDiff,
  configChanged,
  configDiff,
  formatCost,
  formatCostDelta,
  formatDelta,
  formatPct,
  lineDiff,
} from "./eval-format";

const cfg = (over: Partial<EvalConfigSnapshot> = {}): EvalConfigSnapshot => ({
  agent_version: 1,
  config_id: "c1",
  provider: "openrouter",
  model: "m1",
  system_prompt: "p",
  strategy: "single-pass",
  skills: [],
  ...over,
});

describe("formatPct (AC-41c, AC-44a)", () => {
  it("rounds to whole percentages and renders null as a dash", () => {
    expect(formatPct(0.666)).toBe("67%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("formatDelta (AC-45a)", () => {
  it("writes the sign as text in whole points", () => {
    expect(formatDelta(0.66, 0.62)).toBe("▲ 4 pt");
    expect(formatDelta(0.5, 0.62)).toBe("▼ 12 pt");
    expect(formatDelta(0.5, 0.5)).toBe("± 0 pt");
  });
  it("is null when either side is unknown", () => {
    expect(formatDelta(null, 0.5)).toBeNull();
    expect(formatDelta(0.5, null)).toBeNull();
  });
});

describe("formatCost (AC-46a)", () => {
  it("shows a dash for unknown cost, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.0123)).toBe("$0.01");
    expect(formatCost(0.0042)).toBe("$0.0042");
  });
  it("formats a signed cost delta", () => {
    expect(formatCostDelta(0.1, 0.15)).toBe("+$0.05");
    expect(formatCostDelta(0.15, 0.1)).toBe("−$0.05");
    expect(formatCostDelta(null, 0.1)).toBeNull();
  });
});

describe("lineDiff (AC-51a)", () => {
  it("marks added and removed lines", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc")).toEqual([
      { op: " ", text: "a" },
      { op: "−", text: "b" },
      { op: "+", text: "x" },
      { op: " ", text: "c" },
    ]);
  });
  it("returns only context lines for identical text", () => {
    expect(lineDiff("a\nb", "a\nb").every((l) => l.op === " ")).toBe(true);
  });
});

describe("configDiff (AC-52a)", () => {
  it("lists model, strategy and skill changes", () => {
    const a = cfg({
      skills: [
        { skill_id: "s1", name: "Sec", version: 1 },
        { skill_id: "s2", name: "Perf", version: 1 },
      ],
    });
    const b = cfg({
      model: "m2",
      strategy: "map-reduce",
      skills: [
        { skill_id: "s1", name: "Sec", version: 2 },
        { skill_id: "s3", name: "Style", version: 1 },
      ],
    });
    expect(configDiff(a, b)).toEqual([
      { kind: "model", from: "openrouter/m1", to: "openrouter/m2" },
      { kind: "strategy", from: "single-pass", to: "map-reduce" },
      { kind: "skill_version", name: "Sec", from: 1, to: 2 },
      { kind: "skill_added", name: "Style" },
      { kind: "skill_removed", name: "Perf" },
    ]);
  });
  it("is empty for equal snapshots", () => {
    expect(configDiff(cfg(), cfg())).toEqual([]);
  });
});

describe("caseSetDiff (AC-53)", () => {
  it("counts added and removed cases", () => {
    expect(caseSetDiff(["a", "b"], ["b", "c", "d"])).toEqual({ added: 2, removed: 1 });
    expect(caseSetDiff(["a"], ["a"])).toEqual({ added: 0, removed: 0 });
  });
});

describe("configChanged (AC-47)", () => {
  it("flags same version with a different config id only", () => {
    expect(configChanged({ config: cfg({ config_id: "c2" }) }, { config: cfg() })).toBe(true);
    expect(configChanged({ config: cfg({ agent_version: 2, config_id: "c2" }) }, { config: cfg() })).toBe(false);
    expect(configChanged({ config: cfg() }, { config: cfg() })).toBe(false);
    expect(configChanged({ config: cfg() }, undefined)).toBe(false);
  });
});
