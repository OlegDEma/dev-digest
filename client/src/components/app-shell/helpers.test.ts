import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor, repoSwitchTarget } from "./helpers";

describe("activeKeyFor — onboarding tour", () => {
  it("marks the tour item active on a repo tour page (AC-2)", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/")).toBe("onboarding-tour");
  });

  it("does not mark any item on the Add repository page (AC-3)", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("keeps the other keys unchanged", () => {
    expect(activeKeyFor("/repos/r1/pulls/12")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
    expect(activeKeyFor("/settings/api-keys")).toBe("settings");
  });
});

describe("NAV", () => {
  it("lists Pull Requests, Onboarding Tour, Project Context in order (AC-1)", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE")!;
    expect(workspace.items.map((i) => i.key)).toEqual(["pulls", "onboarding-tour", "context"]);
    expect(workspace.items[1]!.href).toBe("/repos/:repoId/onboarding");
  });
});

describe("repoSwitchTarget (AC-4)", () => {
  it("stays on the tour page when switching repos from a tour page", () => {
    expect(repoSwitchTarget("/repos/a/onboarding", "b")).toBe("/repos/b/onboarding");
  });

  it("lands on pulls from any other page, including Add repository", () => {
    expect(repoSwitchTarget("/repos/a/pulls", "b")).toBe("/repos/b/pulls");
    expect(repoSwitchTarget("/onboarding", "b")).toBe("/repos/b/pulls");
  });
});
