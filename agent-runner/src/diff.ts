import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

/** Paths of DevDigest's own generated files — reviewing them is noise. */
const IGNORED_PREFIXES = ['.devdigest/', '.github/workflows/'];

/** Drop whole `diff --git` sections for ignored paths from a raw diff. */
export function stripIgnoredFiles(raw: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      const p = line.match(/ b\/(.*)$/)?.[1]?.trim() ?? '';
      skipping = IGNORED_PREFIXES.some((x) => p.startsWith(x));
    }
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Minimal unified-diff parser — a self-contained copy of the server's
 * `adapters/git/diff-parser.ts` so the bundle needs nothing from `server/`.
 * Produces per-file hunks + new-side line numbers for the citation gate.
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;
  let cursor = 0;

  const flushHunk = () => {
    if (current && hunk) current.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushFile();
      current = { path: '', additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) current = { path: '', additions: 0, deletions: 0, hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hh) {
      flushHunk();
      hunk = {
        file: current?.path ?? '',
        oldStart: Number(hh[1]),
        oldLines: hh[2] ? Number(hh[2]) : 1,
        newStart: Number(hh[3]),
        newLines: hh[4] ? Number(hh[4]) : 1,
        newLineNumbers: [],
      };
      cursor = Number(hh[3]);
      continue;
    }
    if (!current || !hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      hunk.newLineNumbers.push(cursor++);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
    } else {
      hunk.newLineNumbers.push(cursor++);
    }
  }
  flushFile();
  return { raw, files: files.filter((f) => f.path) };
}
