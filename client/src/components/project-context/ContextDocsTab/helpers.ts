/* ContextDocsTab helpers — pure row building, token sum, reorder and the
   skill tab's "SERIALIZES AS" preview. */
import type { DiscoveredDocument, ProjectContextListing } from "@devdigest/shared";

export interface ContextRow {
  path: string;
  /** The discovered document, or null when the path is not in the listing. */
  doc: DiscoveredDocument | null;
  attached: boolean;
  /** Attached, absent from the repository and the listing is complete. */
  absent: boolean;
}

/**
 * Attached paths first (persisted order), then the unattached documents in path
 * order. An attached path missing from the listing is "absent" — unless the
 * listing is truncated, where it may simply lie beyond the cap.
 */
export function buildContextRows(listing: ProjectContextListing, attached: readonly string[]): ContextRow[] {
  const byPath = new Map(listing.documents.map((d) => [d.path, d]));
  const attachedSet = new Set(attached);
  const rows: ContextRow[] = attached.map((path) => {
    const doc = byPath.get(path) ?? null;
    return { path, doc, attached: true, absent: doc === null && !listing.truncated };
  });
  for (const doc of listing.documents) {
    if (!attachedSet.has(doc.path)) rows.push({ path: doc.path, doc, attached: false, absent: false });
  }
  return rows;
}

/** Sum of the estimates of attached rows that are present in the listing. */
export function attachedTokenSum(rows: readonly ContextRow[]): number {
  return rows.reduce((sum, r) => (r.attached && r.doc ? sum + (r.doc.estimated_tokens ?? 0) : sum), 0);
}

/** Case-insensitive match on file name or path; attach state is untouched. */
export function filterRows(rows: readonly ContextRow[], query: string): ContextRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => {
    const name = r.doc?.name ?? r.path.split("/").pop() ?? r.path;
    return r.path.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });
}

/** Append at the end; a path already attached is left where it is. */
export function attachPath(attached: readonly string[], path: string): string[] {
  return attached.includes(path) ? [...attached] : [...attached, path];
}

export function detachPath(attached: readonly string[], path: string): string[] {
  return attached.filter((p) => p !== path);
}

/**
 * Move `path` to the slot of the nearest attached neighbour in `direction`
 * that is also visible, so reordering under a filter never swaps with a hidden
 * row. Returns the list unchanged when there is nowhere to go.
 */
export function moveAttached(
  attached: readonly string[],
  path: string,
  direction: -1 | 1,
  visible: ReadonlySet<string>,
): string[] {
  const from = attached.indexOf(path);
  if (from < 0) return [...attached];
  let to = from + direction;
  while (to >= 0 && to < attached.length && !visible.has(attached[to]!)) to += direction;
  if (to < 0 || to >= attached.length) return [...attached];
  return moveTo(attached, path, attached[to]!);
}

/** Drop `path` into the position currently held by `target`. */
export function moveTo(attached: readonly string[], path: string, target: string): string[] {
  const from = attached.indexOf(path);
  const to = attached.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...attached];
  const next = [...attached];
  next.splice(from, 1);
  next.splice(to, 0, path);
  return next;
}

/** The skill tab's preview of how the attached set serialises into a prompt. */
export function serializesAs(attached: readonly string[]): string {
  return ["## Project context", ...attached.map((p) => `- ${p}`)].join("\n");
}
