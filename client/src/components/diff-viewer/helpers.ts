/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

/**
 * Split items into those whose key is among the rendered line keys and the rest
 * (null key, or a key not rendered). Input order is preserved in each bucket.
 */
export function partitionByLineKey<T>(
  items: T[],
  keyOf: (item: T) => string | null,
  rendered: Set<string>,
): { matched: Map<string, T[]>; unmatched: T[] } {
  const matched = new Map<string, T[]>();
  const unmatched: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (key && rendered.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(item);
      matched.set(key, list);
    } else {
      unmatched.push(item);
    }
  }
  return { matched, unmatched };
}
