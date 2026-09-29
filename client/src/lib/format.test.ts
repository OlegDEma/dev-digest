import { describe, it, expect } from "vitest";
import { approxTokens, formatCostUsd, formatTokenCount } from "./format";

describe("formatCostUsd (Run Cost Badge)", () => {
  it("renders null/undefined as an em dash, never a number", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
  });

  it("uses fixed 6 decimals so a column of costs aligns and sums by eye", () => {
    // Real per-agent run costs from one review round (micro-dollar range).
    expect(formatCostUsd(0.00002455)).toBe("$0.000025");
    expect(formatCostUsd(0.00025172)).toBe("$0.000252");
    expect(formatCostUsd(0.00017352)).toBe("$0.000174");
    // …and their sum renders with the SAME precision.
    expect(formatCostUsd(0.0005317)).toBe("$0.000532");
  });

  it("keeps sub-cent costs visible — never collapses a real cost to $0.00", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.001300");
    expect(formatCostUsd(0.012)).toBe("$0.012000");
  });

  it("renders a genuine zero and larger costs at the same precision", () => {
    expect(formatCostUsd(0)).toBe("$0.000000");
    expect(formatCostUsd(0.06)).toBe("$0.060000");
    expect(formatCostUsd(1.2345)).toBe("$1.234500");
  });
});

describe("approxTokens / formatTokenCount (skills + trace token chips)", () => {
  it("estimates ceil(chars / 4) and treats empty as 0", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens(null)).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });

  it("formats compactly with one decimal under 10k", () => {
    expect(formatTokenCount(830)).toBe("830");
    expect(formatTokenCount(1240)).toBe("1.2k");
    expect(formatTokenCount(12_400)).toBe("12k");
  });
});
