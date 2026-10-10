import type { PrHistoryItem, PrTouchingFile } from '@devdigest/shared';

/** Most-changed files first (then path, for a stable order); only the first `max` paths. */
export function pickFiles(
  prFiles: { path: string; additions: number; deletions: number }[],
  max: number,
): string[] {
  return [...prFiles]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path))
    .slice(0, max)
    .map((f) => f.path);
}

/** Merged PRs only, minus the current one, with the overlapping paths aggregated; newest first. */
export function toPrHistory(rows: PrTouchingFile[], excludeNumber: number, max: number): PrHistoryItem[] {
  const byNumber = new Map<number, { row: PrTouchingFile & { merged_at: string }; paths: Set<string> }>();
  for (const r of rows) {
    if (r.merged_at == null || r.number === excludeNumber) continue;
    const hit = byNumber.get(r.number);
    if (hit) hit.paths.add(r.path);
    else byNumber.set(r.number, { row: { ...r, merged_at: r.merged_at }, paths: new Set([r.path]) });
  }
  return [...byNumber.values()]
    .sort((a, b) => Date.parse(b.row.merged_at) - Date.parse(a.row.merged_at))
    .slice(0, max)
    .map(({ row, paths }) => ({
      pr_number: row.number,
      title: row.title,
      merged_at: row.merged_at,
      author: row.author,
      files_overlap: [...paths].sort(),
      notes: '',
    }));
}
