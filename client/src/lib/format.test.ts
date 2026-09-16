import { describe, it, expect } from "vitest";
import { formatCostUsd } from "./format";

describe("formatCostUsd (Run Cost Badge)", () => {
  it("renders null/undefined as an em dash, never a fake price", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
  });

  it("renders a genuine zero as $0.00 (truthful, distinct from unknown)", () => {
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("keeps ≥3 significant figures for sub-cent costs (never collapses to $0.01)", () => {
    expect(formatCostUsd(0.012)).toBe("$0.012");
    expect(formatCostUsd(0.0013)).toBe("$0.0013");
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.003)).toBe("$0.003");
  });

  it("trims trailing zeros (matches the design's $0.06)", () => {
    expect(formatCostUsd(0.06)).toBe("$0.06");
    expect(formatCostUsd(0.028)).toBe("$0.028");
  });

  it("rounds larger costs to 3 significant figures", () => {
    expect(formatCostUsd(1.2345)).toBe("$1.23");
  });
});
