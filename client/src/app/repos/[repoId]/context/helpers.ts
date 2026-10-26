/* Pure helpers for the Project Context page. */
import type { DiscoveredDocument } from "@devdigest/shared";

export interface FolderGroup {
  folder: string;
  docs: DiscoveredDocument[];
}

/** Group documents by folder; folders and the documents inside each in path order. */
export function groupByFolder(docs: readonly DiscoveredDocument[]): FolderGroup[] {
  const byFolder = new Map<string, DiscoveredDocument[]>();
  for (const doc of docs) {
    const list = byFolder.get(doc.folder);
    if (list) list.push(doc);
    else byFolder.set(doc.folder, [doc]);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...byFolder.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([folder, list]) => ({ folder, docs: list.sort((a, b) => cmp(a.path, b.path)) }));
}
