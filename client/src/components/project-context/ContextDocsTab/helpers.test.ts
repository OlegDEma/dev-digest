import { describe, it, expect } from "vitest";
import type { DiscoveredDocument, ProjectContextListing } from "@devdigest/shared";
import {
  attachPath,
  attachedTokenSum,
  buildContextRows,
  detachPath,
  filterRows,
  moveAttached,
  serializesAs,
} from "./helpers";

const doc = (path: string, tokens: number | null = 100): DiscoveredDocument => ({
  path,
  folder: path.split("/").slice(0, -1).join("/"),
  name: path.split("/").pop()!,
  bucket: "specs",
  size_bytes: 10,
  status: "ok",
  estimated_tokens: tokens,
  used_by_agents: 0,
});

const listing = (paths: string[], over: Partial<ProjectContextListing> = {}): ProjectContextListing => ({
  repo_id: "r1",
  clone_available: true,
  total_found: paths.length,
  truncated: false,
  documents: paths.map((p) => doc(p)),
  ...over,
});

describe("buildContextRows", () => {
  it("lists attached rows first in persisted order, then the rest in path order", () => {
    const rows = buildContextRows(listing(["docs/a.md", "docs/b.md", "specs/c.md"]), ["specs/c.md", "docs/a.md"]);
    expect(rows.map((r) => [r.path, r.attached])).toEqual([
      ["specs/c.md", true],
      ["docs/a.md", true],
      ["docs/b.md", false],
    ]);
  });

  it("marks an attached path missing from a complete listing as absent, and keeps it out of the sum", () => {
    const rows = buildContextRows(listing(["docs/a.md"]), ["docs/a.md", "docs/gone.md"]);
    expect(rows[1]).toMatchObject({ path: "docs/gone.md", absent: true, doc: null });
    expect(attachedTokenSum(rows)).toBe(100);
  });

  it("does not mark a path absent when the listing is truncated", () => {
    const rows = buildContextRows(listing(["docs/a.md"], { truncated: true, total_found: 3000 }), ["docs/beyond.md"]);
    expect(rows[0]).toMatchObject({ absent: false, attached: true, doc: null });
    expect(attachedTokenSum(rows)).toBe(0);
  });
});

describe("filterRows / attach / move / serialize", () => {
  const rows = buildContextRows(listing(["docs/Alpha.md", "specs/beta.md"]), ["specs/beta.md"]);

  it("filters on name or path, case-insensitively", () => {
    expect(filterRows(rows, "ALPHA").map((r) => r.path)).toEqual(["docs/Alpha.md"]);
    expect(filterRows(rows, "specs/").map((r) => r.path)).toEqual(["specs/beta.md"]);
    expect(filterRows(rows, "  ")).toHaveLength(2);
  });

  it("appends on attach, removes on detach", () => {
    expect(attachPath(["a"], "b")).toEqual(["a", "b"]);
    expect(attachPath(["a"], "a")).toEqual(["a"]);
    expect(detachPath(["a", "b"], "a")).toEqual(["b"]);
  });

  it("moves among visible neighbours only", () => {
    const all = new Set(["a", "b", "c"]);
    expect(moveAttached(["a", "b", "c"], "c", -1, all)).toEqual(["a", "c", "b"]);
    expect(moveAttached(["a", "b", "c"], "a", -1, all)).toEqual(["a", "b", "c"]);
    // "b" is filtered out: c jumps over it to a's slot.
    expect(moveAttached(["a", "b", "c"], "c", -1, new Set(["a", "c"]))).toEqual(["c", "a", "b"]);
  });

  it("serialises the attached set in order", () => {
    expect(serializesAs(["x.md", "y.md"])).toBe("## Project context\n- x.md\n- y.md");
  });
});
