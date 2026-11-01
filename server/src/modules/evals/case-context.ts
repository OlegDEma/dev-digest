import {
  EVAL_INPUT_LIMITS,
  normalizeEvalDiff,
  type EvalCaseContextReport,
  type EvalCaseContextSkip,
  type EvalCaseContextSkipReason,
  type EvalCaseInputFile,
  type EvalPrMeta,
} from '@devdigest/shared';

/**
 * Pure builder of a finding-derived case's context: the other files of the PR
 * diff (as Files) and the PR title/description (as PR meta). No I/O — the
 * service loads the diff and passes it in. Limits are `EVAL_INPUT_LIMITS`, the
 * same ones the save validator enforces.
 */

const MAX_PATH_CHARS = 300;
const ELLIPSIS = '…';
const WORD_TOKEN = /[A-Za-z0-9_]+/g;
const HUNK_HEADER = /^@@ -\d/;
const SKIP_REASONS: readonly EvalCaseContextSkipReason[] = [
  'no_diff',
  'path_too_long',
  'file_size',
  'files_count',
  'files_total',
];

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).length;

export interface CaseContextInput {
  /** The raw PR diff (every file section). */
  raw: string;
  /** The finding's file path, and its section already cut by `sliceFileDiff`. */
  findingFile: string;
  findingSection: string;
  pull: { title: string; body: string | null; filesCount: number };
}

export interface CaseContext {
  inputFiles: EvalCaseInputFile[];
  inputMeta: EvalPrMeta;
  context: EvalCaseContextReport;
}

interface Section {
  path: string;
  /** True when this section is the finding's own file (same rule as `sliceFileDiff`). */
  own: boolean;
  content: string;
  hunks: number;
}

/** UTF-16 truncation to `max` units ending in "…", never leaving half a surrogate pair. */
export function truncateChars(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut + ELLIPSIS;
}

/** Code-point order (not UTF-16 unit order, which JS `<` uses). */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i)!;
    const cb = b.codePointAt(j)!;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

/** File name minus its last extension; a leading-dot name (`.gitignore`) has an empty stem. */
export function stemOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? (dot === 0 ? '' : base) : base.slice(0, dot);
}

export function sharedDirSegments(a: string, b: string): number {
  const da = a.split('/').slice(0, -1);
  const db = b.split('/').slice(0, -1);
  let n = 0;
  while (n < da.length && n < db.length && da[n] === db[n]) n++;
  return n;
}

function sectionPath(lines: string[]): string {
  let plus: string | undefined;
  let minus: string | undefined;
  let rename: string | undefined;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (HUNK_HEADER.test(line)) break;
    if (line.startsWith('+++ ')) plus = line.slice(4);
    else if (line.startsWith('--- ')) minus = line.slice(4);
    else if (line.startsWith('rename to ')) rename = line.slice(10);
  }
  const strip = (p: string, side: 'a' | 'b') => (p.startsWith(`${side}/`) ? p.slice(2) : p);
  if (plus !== undefined && plus !== '/dev/null') return strip(plus.split('\t')[0]!, 'b');
  if (plus === '/dev/null' && minus !== undefined && minus !== '/dev/null') {
    return strip(minus.split('\t')[0]!, 'a');
  }
  if (rename !== undefined) return rename;
  const header = lines[0]!;
  const at = header.lastIndexOf(' b/');
  return at >= 0 ? header.slice(at + 3) : '';
}

/** Cut `raw` at its `diff --git` lines; same-path sections are merged in diff order. */
function splitSections(raw: string, findingFile: string): Section[] {
  const text = normalizeEvalDiff(raw);
  const starts: number[] = [];
  const re = /^diff --git /gm;
  for (let m = re.exec(text); m; m = re.exec(text)) starts.push(m.index);
  const byPath = new Map<string, Section>();
  const ownHeader = ` b/${findingFile}`;
  for (let k = 0; k < starts.length; k++) {
    const content = text.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : text.length);
    const lines = content.split('\n');
    const own = lines[0]!.endsWith(ownHeader);
    const path = own ? findingFile : sectionPath(lines);
    const hunks = lines.reduce((n, l) => (HUNK_HEADER.test(l) ? n + 1 : n), 0);
    const prev = byPath.get(path);
    if (prev) {
      prev.content += content;
      prev.hunks += hunks;
      prev.own = prev.own || own;
    } else {
      byPath.set(path, { path, own, content, hunks });
    }
  }
  return [...byPath.values()];
}

function stemMatcher(findingSection: string): (stem: string) => boolean {
  const tokens = new Set(findingSection.match(WORD_TOKEN) ?? []);
  return (stem) => {
    if (stem === '') return false;
    if (/^[A-Za-z0-9_]+$/.test(stem)) return tokens.has(stem);
    const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![A-Za-z0-9_])${esc}(?![A-Za-z0-9_])`).test(findingSection);
  };
}

export function buildCaseContext(input: CaseContextInput): CaseContext {
  const { findingFile, pull } = input;
  const L = EVAL_INPUT_LIMITS;
  const sections = splitSections(input.raw, findingFile);
  const section = normalizeEvalDiff(input.findingSection);
  const matches = stemMatcher(section);

  const candidates = sections
    .filter((s) => !s.own && s.path !== findingFile)
    .map((s) => ({
      s,
      // Over-long paths are skipped as path_too_long anyway: never build a regex from them.
      tier: s.path.length <= MAX_PATH_CHARS && matches(stemOf(s.path)) ? 1 : 2,
      shared: sharedDirSegments(s.path, findingFile),
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier || b.shared - a.shared || compareCodePoints(a.s.path, b.s.path),
    );

  const inputFiles: EvalCaseInputFile[] = [];
  const skipped: EvalCaseContextSkip[] = [];
  let total = 0;
  for (const { s } of candidates) {
    const skip = (reason: EvalCaseContextSkipReason) => skipped.push({ path: s.path, reason });
    if (s.hunks === 0 || s.path === '') {
      skip('no_diff');
      continue;
    }
    if (s.path.length > MAX_PATH_CHARS) {
      skip('path_too_long');
      continue;
    }
    const size = byteLength(s.content);
    if (size > L.fileBytes) {
      skip('file_size');
      continue;
    }
    if (inputFiles.length >= L.filesCount) {
      skip('files_count');
      continue;
    }
    if (total + size > L.filesTotalBytes) {
      skip('files_total');
      continue;
    }
    total += size;
    inputFiles.push({ path: s.path, content: s.content });
  }

  const title = truncateChars(pull.title, L.prTitleChars);
  const body = truncateChars(pull.body ?? '', L.prDescriptionChars);
  const truncated = title !== pull.title || body !== (pull.body ?? '');
  const prMeta: EvalCaseContextReport['pr_meta'] =
    title === '' && body === '' ? 'empty' : truncated ? 'truncated' : 'attached';

  return {
    inputFiles,
    inputMeta: { title, description: body },
    context: {
      files_included: inputFiles.length,
      files_skipped: skipped,
      files_unavailable: Math.max(0, pull.filesCount - sections.length),
      pr_meta: prMeta,
    },
  };
}

/** Counts only — never a path, title, body or content (NFR-R6). */
export function contextLogFields(report: EvalCaseContextReport): Record<string, number | string> {
  const out: Record<string, number | string> = {
    files_included: report.files_included,
    files_unavailable: report.files_unavailable,
    pr_meta: report.pr_meta,
  };
  for (const r of SKIP_REASONS) {
    out[`skipped_${r}`] = report.files_skipped.filter((s) => s.reason === r).length;
  }
  return out;
}
