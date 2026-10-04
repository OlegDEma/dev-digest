import { describe, it, expect } from "vitest";
import { partitionByLineKey } from "./helpers";
import { partitionThreads, type CommentThread } from "./comments";

describe("partitionByLineKey", () => {
  const rendered = new Set(["RIGHT:2", "RIGHT:5"]);
  const keyOf = (n: { k: string | null }) => n.k;

  it("splits matched vs unmatched and preserves order", () => {
    const items = [
      { id: 1, k: "RIGHT:5" },
      { id: 2, k: "RIGHT:9" },
      { id: 3, k: "RIGHT:5" },
      { id: 4, k: "RIGHT:2" },
    ];
    const { matched, unmatched } = partitionByLineKey(items, keyOf, rendered);
    expect(matched.get("RIGHT:5")!.map((i) => i.id)).toEqual([1, 3]);
    expect(matched.get("RIGHT:2")!.map((i) => i.id)).toEqual([4]);
    expect(unmatched.map((i) => i.id)).toEqual([2]);
  });

  it("puts a null key in unmatched", () => {
    const { matched, unmatched } = partitionByLineKey([{ k: null }], keyOf, rendered);
    expect(matched.size).toBe(0);
    expect(unmatched).toHaveLength(1);
  });
});

describe("partitionThreads (wrapper parity)", () => {
  const th = (rootId: number, line: number | null): CommentThread => ({
    rootId,
    comments: [],
    line,
    side: "RIGHT",
    isOutdated: line == null,
  });

  it("returns matched/outdated; a thread with line null is outdated", () => {
    const { matched, outdated } = partitionThreads(
      [th(1, 2), th(2, null), th(3, 40)],
      new Set(["RIGHT:2"]),
    );
    expect(matched.get("RIGHT:2")!.map((t) => t.rootId)).toEqual([1]);
    expect(outdated.map((t) => t.rootId)).toEqual([2, 3]);
  });
});
