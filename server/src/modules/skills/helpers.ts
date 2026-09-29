import { unzipSync } from 'fflate';
import type { Skill, SkillImportPreview, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_EXTENSIONS,
  DEFAULT_IMPORT_TYPE,
  EXECUTABLE_EXTENSIONS,
  IGNORED_MEMBER_PATTERNS,
  IMPORTED_SOURCE,
  MARKDOWN_EXTENSIONS,
  MAX_CORE_BYTES,
  MAX_DERIVED_DESCRIPTION_CHARS,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_MEMBERS,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  SKILL_CORE_BASENAME,
} from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * version-bump rule, and the import parser (markdown frontmatter + zip core
 * selection). No I/O: the parser works on bytes already in memory and never
 * touches the filesystem, so an archive can carry anything and nothing of it
 * runs or lands on disk.
 */

// ---- DTOs -------------------------------------------------------------------

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes the skill's content (vs. just toggling `enabled`)
 * relative to the existing row — a content change bumps `version` and snapshots
 * the body into `skill_versions`.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

// ---- stats ------------------------------------------------------------------

/**
 * A rate in whole percent, or null when there is no denominator — the UI shows
 * "—" for null and must never read it as 0%.
 */
export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Per-skill counters over the 30-day window (all zero when the skill saw no run). */
export interface SkillRunMetrics {
  runs: number;
  findings: number;
  accepted: number;
  dismissed: number;
}

export const EMPTY_METRICS: SkillRunMetrics = { runs: 0, findings: 0, accepted: 0, dismissed: 0 };

/** The two rates the rail card shows, derived from the counters. */
export function ratesFor(m: SkillRunMetrics, runsTotal: number): { pull_pct: number | null; accept_pct: number | null } {
  return {
    pull_pct: pct(m.runs, runsTotal),
    accept_pct: pct(m.accepted, m.accepted + m.dismissed),
  };
}

// ---- import: frontmatter ----------------------------------------------------

export interface ParsedFrontmatter {
  /** Top-level `key: value` pairs. Nested blocks are skipped, not parsed. */
  meta: Record<string, string>;
  /** The markdown after the closing `---` (or the whole text when there is none). */
  body: string;
}

const FRONTMATTER_KEY = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const BLOCK_SCALARS = new Set(['>', '>-', '>+', '|', '|-', '|+']);

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Minimal frontmatter reader — the subset a SKILL.md actually uses: a leading
 * `---` block of flat `key: value` lines, block scalars (`>-` folded, `|`
 * literal) for multi-line descriptions, and nested maps (e.g. `metadata:`) which
 * are skipped. Not a YAML parser on purpose: no dependency, no surprises.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const src = text.replace(/^\uFEFF/, '');
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: src };

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { meta: {}, body: src };

  const meta: Record<string, string> = {};
  let i = 1;
  while (i < end) {
    const line = lines[i]!;
    const m = FRONTMATTER_KEY.exec(line);
    if (!m || /^\s/.test(line)) {
      i += 1;
      continue;
    }
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (BLOCK_SCALARS.has(raw)) {
      // Block scalar: gather the indented continuation lines that follow.
      const parts: string[] = [];
      i += 1;
      while (i < end && (/^\s+/.test(lines[i]!) || lines[i]!.trim() === '')) {
        parts.push(lines[i]!.trim());
        i += 1;
      }
      meta[key] = raw.startsWith('>') ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n').trim();
      continue;
    }
    if (raw === '') {
      // Nested map (`metadata:` …): skip its indented lines.
      i += 1;
      while (i < end && /^\s+/.test(lines[i]!)) i += 1;
      continue;
    }
    meta[key] = stripQuotes(raw);
    i += 1;
  }

  return { meta, body: lines.slice(end + 1).join('\n') };
}

// ---- import: markdown → skill core ------------------------------------------

/** The fields the preview needs from one markdown document. */
export interface SkillCore {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** File name without directories or its extension: `a/b/SKILL.md` → `SKILL`. */
export function fileStem(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
  return m?.[1]?.trim() || undefined;
}

function firstParagraph(body: string): string | undefined {
  const lines = body.split(/\r?\n/);
  const para: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '') {
      if (para.length > 0) break;
      continue;
    }
    // Skip headings / fences / rules — a paragraph is prose.
    if (/^(#|```|---|\||>)/.test(t)) {
      if (para.length > 0) break;
      continue;
    }
    para.push(t);
  }
  if (para.length === 0) return undefined;
  const text = para.join(' ');
  return text.length > MAX_DERIVED_DESCRIPTION_CHARS
    ? `${text.slice(0, MAX_DERIVED_DESCRIPTION_CHARS - 1).trimEnd()}…`
    : text;
}

/**
 * Turn one markdown document into a skill core. Frontmatter wins; otherwise the
 * name comes from the first `# ` heading and then the file stem, the description
 * from the first paragraph, and the type is `custom` unless the frontmatter names
 * a known `SkillType`. The body keeps everything after the frontmatter.
 */
export function skillFromMarkdown(filename: string, text: string): SkillCore {
  const { meta, body } = parseFrontmatter(text);
  const trimmedBody = body.trim();
  const typeParsed = SkillTypeSchema.safeParse(meta.type?.toLowerCase());
  return {
    name: (meta.name?.trim() || firstHeading(trimmedBody) || fileStem(filename)).trim(),
    description: (meta.description?.trim() || firstParagraph(trimmedBody) || '').trim(),
    type: typeParsed.success ? typeParsed.data : DEFAULT_IMPORT_TYPE,
    body: trimmedBody,
  };
}

// ---- import: zip → skill core ------------------------------------------------

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

/** Whether an archive member looks like code/binary we must never run. */
export function isExecutableLooking(path: string): boolean {
  return (EXECUTABLE_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

function isMarkdownMember(path: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

function isPackagingNoise(path: string): boolean {
  return IGNORED_MEMBER_PATTERNS.some((re) => re.test(path));
}

function depthOf(path: string): number {
  return path.split('/').length;
}

/**
 * Pick the member that IS the skill: a `SKILL.md` (shallowest wins), else the
 * only markdown file, else the shallowest markdown file (then by name, so the
 * choice is deterministic). Packaging noise (`__MACOSX/`, `._*`) never qualifies.
 */
export function pickCoreEntry(members: string[]): string | undefined {
  const md = members.filter((m) => !m.endsWith('/') && isMarkdownMember(m) && !isPackagingNoise(m));
  if (md.length === 0) return undefined;
  const byDepthThenName = (a: string, b: string) => depthOf(a) - depthOf(b) || a.localeCompare(b);
  const named = md
    .filter((m) => (m.split('/').pop() ?? '').toLowerCase() === SKILL_CORE_BASENAME)
    .sort(byDepthThenName);
  if (named.length > 0) return named[0];
  if (md.length === 1) return md[0];
  return [...md].sort(byDepthThenName)[0];
}

export interface ZipCore extends SkillCore {
  core_entry: string;
  ignored_entries: string[];
  warnings: string[];
}

/**
 * Read a skill out of a `.zip` held in memory. The archive's directory is walked
 * first (member count + declared sizes are checked against the limits before any
 * inflation); only the chosen markdown member is ever decompressed. Everything
 * else is reported as ignored — it is neither written to disk nor executed, and
 * member paths are never resolved against a directory.
 */
export function skillFromZip(bytes: Uint8Array): ZipCore {
  const members: string[] = [];
  let declaredTotal = 0;

  // Pass 1 (filter callback, no inflation): collect the directory and enforce
  // the limits. Returning false skips decompression of that member entirely.
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (info) => {
        members.push(info.name);
        if (members.length > MAX_ZIP_MEMBERS) {
          throw new ValidationError(`Archive has more than ${MAX_ZIP_MEMBERS} members`);
        }
        declaredTotal += info.originalSize;
        if (declaredTotal > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new ValidationError(
            `Archive expands past ${Math.round(MAX_ZIP_UNCOMPRESSED_BYTES / 1024)} KB`,
          );
        }
        // Decompress markdown only, and only when it fits the core budget.
        return (
          !info.name.endsWith('/') &&
          isMarkdownMember(info.name) &&
          !isPackagingNoise(info.name) &&
          info.originalSize <= MAX_CORE_BYTES
        );
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Could not read the archive — is it a plain (unencrypted) .zip?', {
      reason: (err as Error).message,
    });
  }

  const core = pickCoreEntry(members);
  if (!core) {
    throw new ValidationError('No markdown skill file (SKILL.md or *.md) found in the archive', {
      members: members.filter((m) => !m.endsWith('/')),
    });
  }
  if (!files[core]) {
    // Chosen by the directory walk but skipped by the filter: it is over the budget.
    throw new ValidationError(
      `${core} is larger than ${Math.round(MAX_CORE_BYTES / 1024)} KB — trim the skill body`,
    );
  }

  const ignored = members.filter((m) => m !== core && !m.endsWith('/'));
  const warnings: string[] = [];
  for (const m of ignored) {
    if (isExecutableLooking(m)) warnings.push(`${m} looks executable — it was not run, extracted or imported.`);
    if (m.split('/').includes('..')) warnings.push(`${m} contains a parent-directory segment (ignored).`);
  }
  const otherMarkdown = ignored.filter((m) => isMarkdownMember(m) && !isPackagingNoise(m));
  if (otherMarkdown.length > 0) {
    warnings.push(`Only ${core} was imported; other markdown members were left out.`);
  }

  const text = new TextDecoder('utf-8').decode(files[core]!);
  return { ...skillFromMarkdown(core, text), core_entry: core, ignored_entries: ignored, warnings };
}

// ---- import: entry point ------------------------------------------------------

/**
 * Parse an uploaded file (base64 body + original name) into an import preview.
 * Pure: bytes in, preview out. Persisting is a separate, explicit `POST /skills`.
 */
export function buildImportPreview(filename: string, contentB64: string): SkillImportPreview {
  const bytes = decodeUpload(contentB64);
  const ext = extensionOf(filename);

  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) {
    const text = new TextDecoder('utf-8').decode(bytes);
    const core = skillFromMarkdown(filename, text);
    return {
      filename,
      ...core,
      source: IMPORTED_SOURCE,
      core_entry: filename,
      ignored_entries: [],
      warnings: [],
    };
  }

  if ((ARCHIVE_EXTENSIONS as readonly string[]).includes(ext)) {
    const zip = skillFromZip(bytes);
    return { filename, ...zip, source: IMPORTED_SOURCE };
  }

  throw new ValidationError(
    `Unsupported file type "${ext || '(none)'}" — upload a .md file or a .zip archive`,
  );
}

/** base64 → bytes, with the size cap applied on the decoded length. */
export function decodeUpload(contentB64: string): Uint8Array {
  // Tolerate a data-URL prefix from FileReader.readAsDataURL.
  const raw = contentB64.replace(/^data:[^;]*;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0) throw new ValidationError('The uploaded file is empty');
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB`);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
