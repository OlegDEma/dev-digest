import { describe, it, expect } from "vitest";
import type { DiscoveredDocument } from "@devdigest/shared";
import { groupByFolder } from "./helpers";

const doc = (path: string): DiscoveredDocument => ({
  path,
  folder: path.split("/").slice(0, -1).join("/"),
  name: path.split("/").pop()!,
  bucket: "docs",
  size_bytes: 1,
  status: "ok",
  estimated_tokens: 1,
  used_by_agents: 0,
});

describe("groupByFolder", () => {
  it("groups by folder and keeps folders and files in path order", () => {
    const groups = groupByFolder([doc("specs/b.md"), doc("docs/z.md"), doc("docs/a.md"), doc("docs/x/q.md")]);
    expect(groups.map((g) => [g.folder, g.docs.map((d) => d.name)])).toEqual([
      ["docs", ["a.md", "z.md"]],
      ["docs/x", ["q.md"]],
      ["specs", ["b.md"]],
    ]);
  });

  it("returns no groups for no documents", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});
