import type { SmartDiff, SmartDiffGroup } from '@devdigest/shared';
import { classifyPath } from './classify.js';
import { ROLE_ORDER } from './constants.js';

/** Sorted, de-duped start lines per file. */
export function findingLinesByPath(
  findings: { file: string; startLine: number }[],
): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = sets.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    sets.set(f.file, set);
  }
  const out = new Map<string, number[]>();
  for (const [file, set] of sets) out.set(file, [...set].sort((a, b) => a - b));
  return out;
}

/** Group files by role: all five groups, in ROLE_ORDER, empty ones included. No split logic: always the no-split value. */
export function buildSmartDiff(
  files: { path: string; additions: number; deletions: number }[],
  lines: Map<string, number[]>,
): SmartDiff {
  const byRole = new Map<string, SmartDiffGroup>(ROLE_ORDER.map((role) => [role, { role, files: [] }]));
  let total = 0;
  for (const f of files) {
    total += f.additions + f.deletions;
    const role = classifyPath(f.path);
    const group = byRole.get(role)!;
    group.files.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: lines.get(f.path) ?? [],
    });
  }
  return {
    groups: ROLE_ORDER.map((r) => byRole.get(r)!),
    split_suggestion: { too_big: false, total_lines: total, proposed_splits: [] },
  };
}
