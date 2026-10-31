import { EvalExpectedList } from './contracts/knowledge.js';

/**
 * Pure helpers shared by the server (save validation) and the client (editor
 * gating) for agent eval cases. The diff parser mirrors the new-side line
 * semantics of the server's `parseUnifiedDiff`; an agreement test guards drift.
 */

export const EVAL_INPUT_LIMITS = {
  diffBytes: 256 * 1024,
  fileBytes: 64 * 1024,
  filesTotalBytes: 256 * 1024,
  filesCount: 10,
  prTitleChars: 200,
  prDescriptionChars: 8000,
} as const;

/**
 * Loose outer caps for the request-body schema (`EvalCaseDraftBody`). They sit
 * well above EVAL_INPUT_LIMITS so every value the spec describes still reaches
 * `validateEvalCaseDraft` and gets its coded 422; they only reject absurd input
 * before any per-item work. String caps are in characters (<= bytes).
 */
export const EVAL_SCHEMA_CAPS = {
  name: 200,
  diffChars: EVAL_INPUT_LIMITS.diffBytes * 2,
  filesCount: EVAL_INPUT_LIMITS.filesCount * 5,
  filePath: 1000,
  fileChars: EVAL_INPUT_LIMITS.fileBytes * 2,
  prTitle: EVAL_INPUT_LIMITS.prTitleChars * 5,
  prDescription: EVAL_INPUT_LIMITS.prDescriptionChars * 4,
  expectedCount: 1000,
} as const;

export const EVAL_CASE_NAME_RE = /^[a-z0-9-]{1,60}$/;

export type EvalDiffInvalidReason =
  | 'no_files'
  | 'no_hunks'
  | 'missing_file_header'
  | 'ambiguous_multi_file';

export type EvalInputLimit =
  | 'diff'
  | 'file'
  | 'files_total'
  | 'files_count'
  | 'pr_title'
  | 'pr_description';

export interface ParsedEvalDiffFile {
  path: string;
  hunks: number;
  /** New-side line numbers covered by the hunks (context and `+` lines). */
  newLines: Set<number>;
}

export interface ParsedEvalDiff {
  files: ParsedEvalDiffFile[];
  /** A hunk header appeared before any `+++ <path>` header. */
  missingFileHeader: boolean;
  /** Several `+++ ` headers where some file section has no `diff --git` line. */
  ambiguousMultiFile: boolean;
}

/** CRLF (and lone CR) to LF; the only normalisation applied to stored diffs. */
export function normalizeEvalDiff(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

export function parseEvalDiff(raw: string): ParsedEvalDiff {
  const lines = normalizeEvalDiff(raw).split('\n');
  const files: ParsedEvalDiffFile[] = [];

  let current: ParsedEvalDiffFile | null = null;
  let inHunk = false;
  let cursor = 0;
  let missingFileHeader = false;
  let plusHeaders = 0;
  let sawUndelimitedHeader = false;
  let sectionHasGitHeader = false;

  const flushFile = () => {
    if (current) files.push(current);
    current = null;
    inHunk = false;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushFile();
      current = { path: '', hunks: 0, newLines: new Set() };
      sectionHasGitHeader = true;
      continue;
    }
    if (line.startsWith('+++ ')) {
      plusHeaders++;
      if (!sectionHasGitHeader) sawUndelimitedHeader = true;
      sectionHasGitHeader = false;
      if (!current) current = { path: '', hunks: 0, newLines: new Set() };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/);
    if (hh) {
      if (!current || !current.path) missingFileHeader = true;
      if (current) current.hunks++;
      inHunk = true;
      cursor = Number(hh[3]);
      continue;
    }
    if (!current || !inHunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.newLines.add(cursor);
      cursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // deletion: no new-side line consumed
    } else {
      current.newLines.add(cursor);
      cursor++;
    }
  }
  flushFile();

  return {
    files: files.filter((f) => f.path),
    missingFileHeader,
    ambiguousMultiFile: plusHeaders > 1 && sawUndelimitedHeader,
  };
}

export interface EvalDiffProblem {
  reason: EvalDiffInvalidReason;
  /** Set for `no_hunks`. */
  file?: string;
}

/** First problem of a diff, in the order missing_file_header, ambiguous_multi_file, no_files, no_hunks. */
export function validateEvalDiff(raw: string): EvalDiffProblem | null {
  const parsed = parseEvalDiff(raw);
  if (parsed.missingFileHeader) return { reason: 'missing_file_header' };
  if (parsed.ambiguousMultiFile) return { reason: 'ambiguous_multi_file' };
  if (parsed.files.length === 0) return { reason: 'no_files' };
  const bare = parsed.files.find((f) => f.hunks === 0);
  if (bare) return { reason: 'no_hunks', file: bare.path };
  return null;
}

/** Path of the first file of the diff, or '' when it has none. */
export function firstDiffFile(raw: string): string {
  return parseEvalDiff(raw).files[0]?.path ?? '';
}

export interface EvalExpectedLocation {
  file: string;
  start_line: number;
  end_line?: number | undefined;
}

/** 0-based indexes of expected items that no finding on this diff could ever match. */
export function unmatchableItems(
  expected: readonly EvalExpectedLocation[],
  parsed: ParsedEvalDiff,
): number[] {
  const byPath = new Map(parsed.files.map((f) => [f.path, f]));
  const out: number[] = [];
  expected.forEach((item, i) => {
    const file = byPath.get(item.file);
    const end = item.end_line ?? item.start_line;
    const hit = file !== undefined && [...file.newLines].some((n) => n >= item.start_line && n <= end);
    if (!hit) out.push(i);
  });
  return out;
}

export interface EvalCaseDraftInput {
  name: string;
  input_diff: string;
  input_files: { path: string; content: string }[];
  pr_meta: { title: string; description: string };
  expected: unknown;
}

export type EvalCaseDraftError =
  | { code: 'invalid_name' }
  | { code: 'input_too_large'; limit: EvalInputLimit }
  | { code: 'invalid_diff'; reason: EvalDiffInvalidReason; file?: string }
  | { code: 'duplicate_file_path'; path: string }
  | { code: 'invalid_expected_output'; path: string; message: string };

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** JSON path of a Zod issue path, rooted at `$` (e.g. `$[0].severity`). */
export function jsonPathOf(path: readonly PropertyKey[]): string {
  let out = '$';
  for (const seg of path) out += typeof seg === 'number' ? `[${seg}]` : `.${String(seg)}`;
  return out;
}

/** First coded error of a case draft, or null when it is valid. Does not touch the name's uniqueness. */
export function validateEvalCaseDraft(draft: EvalCaseDraftInput): EvalCaseDraftError | null {
  if (!EVAL_CASE_NAME_RE.test(draft.name)) return { code: 'invalid_name' };

  const L = EVAL_INPUT_LIMITS;
  const diff = normalizeEvalDiff(draft.input_diff);
  if (bytes(diff) > L.diffBytes) return { code: 'input_too_large', limit: 'diff' };
  if (draft.input_files.length > L.filesCount) {
    return { code: 'input_too_large', limit: 'files_count' };
  }
  let total = 0;
  for (const f of draft.input_files) {
    const b = bytes(normalizeEvalDiff(f.content));
    if (b > L.fileBytes) return { code: 'input_too_large', limit: 'file' };
    total += b;
  }
  if (total > L.filesTotalBytes) return { code: 'input_too_large', limit: 'files_total' };
  if (draft.pr_meta.title.length > L.prTitleChars) {
    return { code: 'input_too_large', limit: 'pr_title' };
  }
  if (draft.pr_meta.description.length > L.prDescriptionChars) {
    return { code: 'input_too_large', limit: 'pr_description' };
  }

  const seen = new Set<string>();
  for (const f of draft.input_files) {
    if (seen.has(f.path)) return { code: 'duplicate_file_path', path: f.path };
    seen.add(f.path);
  }

  const problem = validateEvalDiff(diff);
  if (problem) {
    return {
      code: 'invalid_diff',
      reason: problem.reason,
      ...(problem.file !== undefined ? { file: problem.file } : {}),
    };
  }

  const parsedExpected = EvalExpectedList.safeParse(draft.expected);
  if (!parsedExpected.success) {
    const issue = parsedExpected.error.issues[0]!;
    const path = [...issue.path];
    if (issue.code === 'unrecognized_keys' && issue.keys.length > 0) path.push(issue.keys[0]!);
    return { code: 'invalid_expected_output', path: jsonPathOf(path), message: issue.message };
  }
  return null;
}
