import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';
import {
  MAX_FILE_CHARS,
  MAX_FILE_LINES,
  MAX_SAMPLE_CHARS,
  MIN_PROBE_CHARS,
  MIN_SNIPPET_CHARS,
  PER_BUCKET_COUNT,
} from './constants.js';

/**
 * Pure helpers for the conventions extractor. Everything here is deterministic
 * and dependency-free so the gate can be unit-tested without a DB, a clone or a
 * model. See specs/04-conventions.md §5.
 */

export interface SampledFile {
  path: string;
  /** Raw content AFTER truncation — the same text the model was shown. */
  content: string;
}

// ------------------------------------------------------------------ sampling

/**
 * Render one file with a 1-based line-number gutter. The gutter is the whole
 * point: it is what lets the model cite a line and lets us check the citation.
 */
export function renderSampleFile(path: string, content: string): string {
  const lines = content.split('\n');
  const kept = lines.slice(0, MAX_FILE_LINES);
  const truncatedByLines = lines.length > MAX_FILE_LINES;
  const width = String(kept.length).length;
  let body = kept.map((line, i) => `${String(i + 1).padStart(width, ' ')} | ${line}`).join('\n');
  let truncatedByChars = false;
  if (body.length > MAX_FILE_CHARS) {
    body = body.slice(0, MAX_FILE_CHARS);
    truncatedByChars = true;
  }
  const note = truncatedByLines || truncatedByChars ? '\n… (truncated)' : '';
  return `--- FILE: ${path} ---\n${body}${note}`;
}

/**
 * Concatenate rendered files up to the whole-sample budget. Files are taken in
 * order and a file that would overflow the budget is dropped whole — a
 * half-rendered file would produce citations we cannot verify.
 */
export function renderSample(files: SampledFile[]): { text: string; used: SampledFile[] } {
  const parts: string[] = [];
  const used: SampledFile[] = [];
  let total = 0;
  for (const f of files) {
    const rendered = renderSampleFile(f.path, f.content);
    if (total + rendered.length > MAX_SAMPLE_CHARS) continue;
    parts.push(rendered);
    used.push(f);
    total += rendered.length + 2;
  }
  return { text: parts.join('\n\n'), used };
}

/**
 * Classify a path into a rough architectural bucket. Deliberately crude and
 * deterministic — its only job is to stop one layer from monopolising the
 * sample (§5.1), not to be a correct taxonomy.
 */
export function bucketOf(path: string): string {
  const p = path.toLowerCase();
  if (/\.(test|spec)\./.test(p) || p.includes('__tests__/')) return 'test';
  if (p.includes('route') || p.includes('controller') || p.includes('/api/')) return 'route';
  if (p.includes('service')) return 'service';
  if (p.includes('repositor') || p.includes('/db/') || p.includes('schema')) return 'data';
  if (/\.(tsx|jsx)$/.test(p) || p.includes('component')) return 'ui';
  if (p.includes('hook') || p.includes('/lib/') || p.includes('util') || p.includes('helper')) return 'lib';
  return 'other';
}

/**
 * Take up to `perBucket` paths from each bucket, preserving the incoming rank
 * order within a bucket. One pass over the same budget as a flat top-N, but it
 * spans layers instead of stacking the most central files.
 */
export function pickLayered(paths: string[], perBucket = PER_BUCKET_COUNT): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const p of paths) {
    const b = bucketOf(p);
    const n = seen.get(b) ?? 0;
    if (n >= perBucket) continue;
    seen.set(b, n + 1);
    out.push(p);
  }
  return out;
}

// -------------------------------------------------------------- evidence gate

export type GateFailure = 'path_not_sampled' | 'path_ambiguous' | 'snippet_too_short' | 'snippet_not_found';

export interface GateOk {
  ok: true;
  path: string;
  /** 1-based, as found in the file — not as claimed. */
  line: number;
  /** Sliced from the FILE, never from the model's reply. */
  snippet: string;
}
export interface GateFail {
  ok: false;
  reason: GateFailure;
}
export type GateResult = GateOk | GateFail;

/** Case- and whitespace-insensitive comparison key. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a claimed path against the sampled set: an exact match, else a
 * UNIQUE suffix match (the model often writes `./src/a.ts` or just `a.ts`).
 * Ambiguity is reported, never guessed — guessing would defeat the gate.
 */
export function resolveSampledPath(
  claimed: string,
  files: SampledFile[],
): { path: string } | { error: 'path_not_sampled' | 'path_ambiguous' } {
  const want = claimed.replace(/^\.\//, '').trim();
  const exact = files.find((f) => f.path === want);
  if (exact) return { path: exact.path };
  const suffix = files.filter((f) => f.path.endsWith(`/${want}`) || f.path === want);
  if (suffix.length === 1) return { path: suffix[0]!.path };
  if (suffix.length > 1) return { error: 'path_ambiguous' };
  return { error: 'path_not_sampled' };
}

/** Strip the common leading indentation from a block of lines. */
export function dedent(text: string): string {
  const lines = text.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/**
 * The evidence gate — three mechanical checks, no model involved:
 *   1. the cited path was actually sampled,
 *   2. the snippet is substantial enough to identify anything,
 *   3. the snippet really occurs in that file.
 *
 * A wrong line number is CORRECTED (miscounting is a formatting slip); an
 * invented snippet is REJECTED (that is a fabrication). The snippet returned
 * for display is sliced out of the file, so the UI can never show a paraphrase
 * as if it were code.
 */
export function verifyCandidate(
  claimed: { evidence_path: string; evidence_line: number; evidence_snippet: string },
  files: SampledFile[],
): GateResult {
  const resolved = resolveSampledPath(claimed.evidence_path, files);
  if ('error' in resolved) return { ok: false, reason: resolved.error };

  const snippet = claimed.evidence_snippet ?? '';
  if (snippet.replace(/\s/g, '').length < MIN_SNIPPET_CHARS) {
    return { ok: false, reason: 'snippet_too_short' };
  }

  const file = files.find((f) => f.path === resolved.path)!;
  const fileLines = file.content.split('\n');
  const snippetLines = snippet.split('\n').filter((l, i, a) => !(l.trim() === '' && (i === 0 || i === a.length - 1)));
  const span = Math.max(1, snippetLines.length);
  const target = norm(snippetLines.join(' '));

  const hits: number[] = [];
  for (let i = 0; i + span <= fileLines.length; i++) {
    if (norm(fileLines.slice(i, i + span).join(' ')) === target) hits.push(i + 1);
  }
  // Fall back to a containment match: the model often quotes a fragment of a
  // longer line. Still grounded — the text is demonstrably in the file.
  if (hits.length === 0) {
    for (let i = 0; i < fileLines.length; i++) {
      if (norm(fileLines[i]!).includes(target) && target.length > 0) hits.push(i + 1);
    }
  }
  if (hits.length === 0) return { ok: false, reason: 'snippet_not_found' };

  // Nearest hit to the claimed line wins, so a repeated line resolves to the
  // one the model actually meant.
  const claimedLine = Number.isFinite(claimed.evidence_line) ? claimed.evidence_line : hits[0]!;
  const line = hits.reduce((best, h) => (Math.abs(h - claimedLine) < Math.abs(best - claimedLine) ? h : best), hits[0]!);

  const end = Math.min(fileLines.length, line - 1 + span);
  return { ok: true, path: resolved.path, line, snippet: dedent(fileLines.slice(line - 1, end).join('\n')).trim() };
}

// -------------------------------------------------------------------- dedupe

/** Loose identity for a rule: lowercase words only, so punctuation drift merges. */
export function ruleKey(rule: string): string {
  return rule.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Drop candidates that repeat each other or a rule the user has already decided
 * on. Deduping against DECIDED rules is what stops a re-scan from re-litigating
 * something the maintainer already rejected.
 */
export function dedupeCandidates<T extends { rule: string }>(
  candidates: T[],
  existingRules: string[] = [],
): { kept: T[]; dropped: number } {
  const seen = new Set(existingRules.map(ruleKey));
  const kept: T[] = [];
  let dropped = 0;
  for (const c of candidates) {
    const k = ruleKey(c.rule);
    if (!k || seen.has(k)) {
      dropped++;
      continue;
    }
    seen.add(k);
    kept.push(c);
  }
  return { kept, dropped };
}

// --------------------------------------------------------------------- probe

/** Escape a literal probe so it can be handed to ripgrep as a regex safely. */
export function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reject a probe that is not plausibly code. Models reliably mistake this field
 * for a label and send the category name back, which then greps as an ordinary
 * English word and reports a large, meaningless count — a fabricated measurement
 * is worse than no measurement, so an unusable probe leaves `occurrences` null.
 */
export function isUsableProbe(probe: string | undefined | null): probe is string {
  if (typeof probe !== 'string') return false;
  const p = probe.trim();
  if (p.length < MIN_PROBE_CHARS) return false;
  if (NON_CODE_PROBES.has(p.toLowerCase())) return false;
  // Defence in depth: the probe is model-written and ends up as an argv element
  // of the grep process. The adapter now passes it via `-e … --`, but a leading
  // `-` is still refused here so a probe can never be read as an option even if
  // some other grep implementation is wired in later. Real probes are code
  // fragments, which do not start with a dash.
  if (p.startsWith('-')) return false;
  // Bare lowercase prose with no code punctuation is a description, not a probe.
  return /[^a-z -]/.test(p);
}

/** Values the model sends when it mistakes `probe_literal` for a label. */
const NON_CODE_PROBES: ReadonlySet<string> = new Set([
  'naming',
  'imports',
  'error-handling',
  'testing',
  'structure',
  'typing',
  'async',
  'styling',
]);

// ----------------------------------------------------------------------- DTO

/** camelCase row → snake_case contract. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId,
    category: row.category,
    rule: row.rule,
    rationale: row.rationale,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    occurrences: row.occurrences,
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------- skill assembly

/**
 * Merge accepted candidates into one markdown skill body. Each rule becomes a
 * section carrying its own evidence, so a reviewer reading the skill can see
 * why the rule is claimed and go look at the line itself.
 */
export function buildSkillBody(candidates: ConventionCandidate[], repoLabel: string): string {
  const parts: string[] = [
    `# Conventions — ${repoLabel}`,
    '',
    `House rules extracted from \`${repoLabel}\` and confirmed against the code. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];
  const byCategory = new Map<string, ConventionCandidate[]>();
  for (const c of candidates) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const [category, list] of byCategory) {
    parts.push('', `## ${category}`);
    for (const c of list) {
      parts.push('', `### ${c.rule}`);
      if (c.rationale) parts.push('', c.rationale);
      const where = c.evidence_line ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
      parts.push('', `Detected in \`${where}\`${c.occurrences ? ` (${c.occurrences} occurrences)` : ''}:`);
      parts.push('', '```', c.evidence_snippet, '```');
    }
  }
  return parts.join('\n');
}

/** Distinct evidence files, for the skill's `evidence_files` column. */
export function evidenceFilesOf(candidates: ConventionCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.evidence_path).filter(Boolean))];
}
