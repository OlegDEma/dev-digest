import { describe, it, expect } from "vitest";
import { buildSegments } from "./helpers";

const pad = { l: 0, r: 0, t: 0, b: 0 };

describe("buildSegments", () => {
  it("splits the line at an unknown value instead of drawing a zero (AC-D68)", () => {
    const segs = buildSegments([0.5, null, 0.5, 1], 30, 100, pad);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toBe("M0.0,50.0 L0.0,50.0");
    expect(segs[1]).toBe("M20.0,50.0 L30.0,0.0");
  });
});
