import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import { groupFiles, filesWithFindings, findingsInFiles, toAnnotations } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const smart = (groups: [SmartDiff["groups"][number]["role"], string[]][]): SmartDiff => ({
  groups: groups.map(([role, paths]) => ({
    role,
    files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
  })),
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

const ROLES = ["core", "tests", "wiring", "docs", "boilerplate"];

describe("groupFiles", () => {
  const files = [file("a.md"), file("src/b.ts"), file("src/c.ts"), file("pnpm-lock.yaml")];

  it("is null while loading", () => {
    expect(groupFiles(files, undefined)).toBeNull();
  });

  it("always returns all five roles in order, empty ones included", () => {
    const out = groupFiles(files, smart([["core", ["src/b.ts"]], ["docs", ["a.md"]]]))!;
    expect(out.map((g) => g.role)).toEqual(ROLES);
    expect(out.map((g) => g.files.length)).toEqual([3, 0, 0, 1, 0]);
    const none = groupFiles([], smart([]))!;
    expect(none.map((g) => g.role)).toEqual(ROLES);
    expect(none.every((g) => g.files.length === 0)).toBe(true);
  });

  it("uses pr.files order inside a group and the response's roles", () => {
    const out = groupFiles(
      files,
      smart([
        ["core", ["src/c.ts", "src/b.ts"]],
        ["docs", ["a.md"]],
        ["boilerplate", ["pnpm-lock.yaml"]],
      ]),
    )!;
    expect(out[0]!.files.map((f) => f.path)).toEqual(["src/b.ts", "src/c.ts"]);
    expect(out[3]!.files.map((f) => f.path)).toEqual(["a.md"]);
    expect(out[4]!.files.map((f) => f.path)).toEqual(["pnpm-lock.yaml"]);
  });

  it("puts an unknown path into core", () => {
    const out = groupFiles([file("new.ts"), file("a.md")], smart([["docs", ["a.md"]]]))!;
    expect(out[0]!.files.map((f) => f.path)).toEqual(["new.ts"]);
    expect(out[3]!.files.map((f) => f.path)).toEqual(["a.md"]);
  });
});

describe("filesWithFindings / toAnnotations", () => {
  const f = (id: string, path: string) =>
    ({ id, file: path, start_line: 3, severity: "WARNING" }) as FindingRecord;

  it("counts distinct files that carry findings", () => {
    const n = filesWithFindings([file("a.ts"), file("b.ts")], [f("1", "a.ts"), f("2", "a.ts"), f("3", "z.ts")]);
    expect(n).toBe(1);
  });

  it("counts findings whose file is in the group", () => {
    expect(findingsInFiles([file("a.ts")], [f("1", "a.ts"), f("2", "a.ts"), f("3", "z.ts")])).toBe(2);
  });

  it("maps findings to annotations", () => {
    expect(toAnnotations([f("1", "a.ts")])).toEqual([
      { id: "1", path: "a.ts", line: 3, severity: "WARNING" },
    ]);
  });
});
