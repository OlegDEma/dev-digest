import { describe, it, expect } from "vitest";
import { buildPrHref, parseLineParam } from "./helpers";

describe("PR detail URL helpers", () => {
  it("builds the deep link, then removes file/line while keeping other params", () => {
    const href = buildPrHref("r1", 7, "trace=abc", { tab: "diff", file: "src/a b.ts", line: 12 });
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/repos/r1/pulls/7?")).toBe(true);
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a b.ts");
    expect(sp.get("line")).toBe("12");
    expect(sp.get("trace")).toBe("abc");

    const cleared = buildPrHref("r1", "7", new URLSearchParams(href.split("?")[1]), { file: null, line: null });
    const csp = new URLSearchParams(cleared.split("?")[1]);
    expect(csp.has("file")).toBe(false);
    expect(csp.has("line")).toBe(false);
    expect(csp.get("tab")).toBe("diff");
    expect(csp.get("trace")).toBe("abc");
    expect(buildPrHref("r1", 7, "file=x", { file: null })).toBe("/repos/r1/pulls/7");
  });

  it("parses the line param as a positive integer only", () => {
    expect(parseLineParam("12")).toBe(12);
    expect(parseLineParam("0")).toBeNull();
    expect(parseLineParam("-3")).toBeNull();
    expect(parseLineParam("1.5")).toBeNull();
    expect(parseLineParam("abc")).toBeNull();
    expect(parseLineParam("")).toBeNull();
    expect(parseLineParam(null)).toBeNull();
  });
});
