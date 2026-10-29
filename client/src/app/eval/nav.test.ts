import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "@/components/app-shell/helpers";

describe("Eval Dashboard nav item", () => {
  it("sits in SKILLS LAB right after Conventions and links to /eval (AC-55a)", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    const keys = lab?.items.map((i) => i.key) ?? [];
    expect(keys.indexOf("eval")).toBe(keys.indexOf("conventions") + 1);
    const item = lab?.items.find((i) => i.key === "eval");
    expect(item?.label).toBe("Eval Dashboard");
    expect(item?.href).toBe("/eval");
  });

  it("is highlighted while the /eval page is open (AC-55b)", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/agents/ag1")).toBe("agents");
  });
});
