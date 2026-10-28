import type {
  OnboardingIndexSummary,
  OnboardingLlmUsage,
  OnboardingPartialReason,
  OnboardingSection,
  OnboardingSkeletonReason,
  OnboardingSkippedFile,
  OnboardingTour,
} from '@devdigest/shared';
import type { OnboardingIndexStats, OnboardingSnapshotFile } from '../repo-intel/types.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { CloneFacts } from './clone-facts.js';
import type { Narrative } from './prompt.js';
import {
  ANNOTATION_MAX_CHARS,
  CHILD_INSTALLS_MAX,
  CRITICAL_PATHS_MAX,
  DESCRIPTION_MAX_CHARS,
  DIAGRAM_MAX_CHARS,
  FACTS_TOKEN_BUDGET,
  FIRST_TASKS_MAX,
  FIRST_TASKS_MIN,
  FIRST_TASKS_SKELETON_REASON,
  FIRST_TASKS_TOO_FEW_REASON,
  FIRST_TASK_PATHS_MAX,
  INDEX_UNAVAILABLE_SECTION_REASON,
  KNOWN_FRAMEWORKS,
  NO_CLONE_RUN_REASON,
  ONBOARDING_EXCLUDED_ROOT_PREFIXES,
  ONBOARDING_EXCLUDED_SUBSTRINGS,
  PROSE_MAX_CHARS,
  README_TOKEN_CAP,
  READING_PATH_MAX,
  ROUTES_MAX,
  RUN_COMMANDS_MAX,
  SCRIPTS_MAX,
  SCRIPT_COMMAND_MAX_CHARS,
  SECTION_TITLES,
  STRUCTURE_FOLDERS_MAX,
  TASK_RATIONALE_MAX_CHARS,
  TASK_TITLE_MAX_CHARS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Types (server-internal: C3 facts, tour context)
// ---------------------------------------------------------------------------

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export interface RankedFile {
  path: string;
  /** pagerank × (1 + hotness) when hotness is available, else pagerank. */
  score: number;
  importers: number;
  endpoints: string[];
  percentile: number;
}

export interface RunCommand {
  order: number;
  command: string;
  source_path: string;
}

export interface Stack {
  package_manager: PackageManager | null;
  ts_files: number;
  js_files: number;
  frameworks: string[];
  manifests: string[];
}

/** C3 — the facts handed to the model. Key order is fixed (AC-37). */
export interface OnboardingFacts {
  repo: { full_name: string; default_branch: string };
  index: OnboardingIndexSummary;
  stack: Stack;
  structure: Array<{ dir: string; files: number }>;
  routes: Array<{ endpoint: string; file: string }>;
  scripts: Array<{ manifest: string; name: string; command: string }>;
  run_commands: Array<{ order: number; command: string }>;
  critical_paths: Array<{ path: string; importers: number; endpoints: number; rank_percentile: number }>;
  reading_path: Array<{ order: number; path: string; importers: number; rank_percentile: number }>;
  readme_excerpt: string | null;
  repo_map: string | null;
}

export interface TourContext {
  generatedAt: string;
  repo: { fullName: string; defaultBranch: string };
  index: OnboardingIndexSummary;
  indexUsable: boolean;
  cloneAvailable: boolean;
  clone: CloneFacts | null;
  /** Every indexed path of the snapshot (the AC-54 validity set). */
  indexedPaths: ReadonlySet<string>;
  /** Non-excluded files, best first. */
  ranked: RankedFile[];
  structure: Array<{ dir: string; files: number }>;
  stack: Stack;
  commands: RunCommand[];
  skipped: OnboardingSkippedFile[];
}

export interface GeneratedRecord {
  event: 'onboarding.generated';
  repo_id: string;
  mode: 'narrative' | 'skeleton';
  completeness: 'full' | 'partial';
  skeleton_reason: OnboardingSkeletonReason | null;
  partial_reasons: OnboardingPartialReason[];
  llm_calls: 0 | 1;
  call_id: string | null;
  attempts: number | null;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  facts_tokens: number;
  dropped_ai_items: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Small text / compare utilities
// ---------------------------------------------------------------------------

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Facts are built with a fixed key order and pre-sorted arrays, so plain stringify is stable (D15). */
export function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

// eslint-disable-next-line no-control-regex
const CONTROL_RUN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** One line: control characters and line breaks become a space, runs collapse, trimmed, clamped. */
export function oneLine(s: string, max: number): string {
  return s.replace(CONTROL_RUN, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max).trimEnd();
}

/** Markdown prose: keeps newlines/tabs, drops other control characters, clamped. */
function cleanProse(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '').trim().slice(0, max).trimEnd();
}

function cleanDiagram(d: string | null): string | null {
  if (d === null) return null;
  const stripped = d.replace(/^\s*```(?:mermaid)?\s*$/gim, '').trim();
  if (stripped === '' || stripped.length > DIAGRAM_MAX_CHARS) return null;
  return stripped;
}

/** Folder / file names go into inline code in markdown: neutralise anything that could break out. */
const mdCode = (s: string) => oneLine(s, 120).replace(/`/g, "'");

// ---------------------------------------------------------------------------
// Exclusions and ranking (AC-47, AC-49)
// ---------------------------------------------------------------------------

export function isExcluded(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    ONBOARDING_EXCLUDED_SUBSTRINGS.some((p) => lower.includes(p)) ||
    ONBOARDING_EXCLUDED_ROOT_PREFIXES.some((p) => lower.startsWith(p))
  );
}

/** Best first: score desc, ties by path asc. Excluded paths are removed. */
export function rankFiles(files: OnboardingSnapshotFile[], hotnessAvailable: boolean): RankedFile[] {
  return files
    .filter((f) => !isExcluded(f.path))
    .map((f) => ({
      path: f.path,
      score: hotnessAvailable ? f.pagerank * (1 + f.hotness) : f.pagerank,
      importers: f.importers,
      endpoints: f.endpoints,
      percentile: f.percentile,
    }))
    .sort((a, b) => b.score - a.score || cmp(a.path, b.path));
}

// ---------------------------------------------------------------------------
// Index summary, completeness, skeleton decision
// ---------------------------------------------------------------------------

export function isIndexUsable(stats: OnboardingIndexStats): boolean {
  return stats.enabled && (stats.status === 'full' || stats.status === 'partial');
}

export function buildIndexSummary(stats: OnboardingIndexStats, cloneAvailable: boolean): OnboardingIndexSummary {
  return {
    status: stats.status,
    files_indexed: stats.filesIndexed,
    source_files_total: stats.totalCandidates,
    files_bounded: stats.bounded,
    files_skipped: stats.filesSkipped,
    last_indexed_sha: stats.lastIndexedSha,
    hotness_available: stats.hotnessAvailable,
    clone_available: cloneAvailable,
  };
}

export function partialReasons(
  index: OnboardingIndexSummary,
  factsTruncated: boolean,
): OnboardingPartialReason[] {
  const out: OnboardingPartialReason[] = [];
  const usable = index.status === 'full' || index.status === 'partial';
  if (usable && index.status === 'partial') out.push('index_partial');
  if (usable && (index.files_bounded ?? 0) > 0) out.push('index_capped');
  if (usable && index.files_skipped > 0) out.push('files_skipped');
  if (factsTruncated) out.push('facts_truncated');
  return out;
}

/** The pre-LLM skeleton precedence (AC-23..AC-25); the missing-key check needs the container. */
export function preLlmSkeletonReason(a: {
  cloneAvailable: boolean;
  stats: OnboardingIndexStats;
  edgeCount: number;
}): OnboardingSkeletonReason | null {
  if (!a.cloneAvailable) return 'no_clone';
  if (!isIndexUsable(a.stats)) return 'index_unavailable';
  if (a.stats.filesIndexed === 0 || a.edgeCount === 0) return 'no_import_graph';
  return null;
}

// ---------------------------------------------------------------------------
// Stack, structure, run commands (AC-38, AC-40, AC-46)
// ---------------------------------------------------------------------------

const TS_FILE = /\.(?:ts|tsx|mts|cts)$/;
const JS_FILE = /\.(?:js|jsx|mjs|cjs)$/;

export function structureOf(files: Array<{ path: string }>): Array<{ dir: string; files: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    const slash = f.path.indexOf('/');
    if (slash <= 0) continue;
    const dir = f.path.slice(0, slash);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([dir, n]) => ({ dir, files: n }))
    .sort((a, b) => b.files - a.files || cmp(a.dir, b.dir))
    .slice(0, STRUCTURE_FOLDERS_MAX);
}

export function packageManagerOf(clone: CloneFacts | null): PackageManager | null {
  if (!clone || clone.manifests.length === 0) return null;
  return clone.lockfilePm ?? 'npm';
}

export function detectStack(clone: CloneFacts | null, files: Array<{ path: string }>): Stack {
  const deps = new Set<string>();
  for (const m of clone?.manifests ?? []) for (const d of m.dependencies) deps.add(d);
  return {
    package_manager: packageManagerOf(clone),
    ts_files: files.filter((f) => TS_FILE.test(f.path)).length,
    js_files: files.filter((f) => JS_FILE.test(f.path)).length,
    frameworks: KNOWN_FRAMEWORKS.filter((f) => deps.has(f)).sort(cmp),
    manifests: (clone?.manifests ?? []).map((m) => m.path),
  };
}

/** A folder name that is safe to paste after `cd ` in a shell. */
const SAFE_DIR = /^[A-Za-z0-9._@][A-Za-z0-9._@-]*$/;

/**
 * AC-40: commands come ONLY from clone facts, in four fixed steps. The model
 * never adds or changes a command (AC-41). A child folder whose name could not
 * be pasted into a shell safely is not offered.
 */
export function deriveRunCommands(clone: CloneFacts | null): RunCommand[] {
  if (!clone || clone.manifests.length === 0) return [];
  const pm = packageManagerOf(clone)!;
  const root = clone.manifests.find((m) => m.dir === '');
  const folders = root
    ? [root]
    : clone.manifests.filter((m) => SAFE_DIR.test(m.dir)).slice(0, CHILD_INSTALLS_MAX);
  if (folders.length === 0) return [];
  const cd = (dir: string, cmd: string) => (dir ? `cd ${dir} && ${cmd}` : cmd);

  const out: Array<Omit<RunCommand, 'order'>> = [];
  for (const m of folders) out.push({ command: cd(m.dir, `${pm} install`), source_path: m.path });
  for (const m of folders) {
    if (m.envExample) {
      out.push({
        command: cd(m.dir, 'cp .env.example .env'),
        source_path: m.dir ? `${m.dir}/.env.example` : '.env.example',
      });
    }
  }
  if (clone.composeFile) out.push({ command: 'docker compose up -d', source_path: clone.composeFile });
  const primary = folders[0]!;
  if ('dev' in primary.scripts) out.push({ command: cd(primary.dir, `${pm} run dev`), source_path: primary.path });
  else if ('start' in primary.scripts) out.push({ command: cd(primary.dir, `${pm} start`), source_path: primary.path });

  return out.slice(0, RUN_COMMANDS_MAX).map((c, i) => ({ order: i + 1, ...c }));
}

// ---------------------------------------------------------------------------
// Tour context
// ---------------------------------------------------------------------------

export function buildTourContext(a: {
  generatedAt: string;
  repo: { fullName: string; defaultBranch: string };
  stats: OnboardingIndexStats;
  cloneAvailable: boolean;
  files: OnboardingSnapshotFile[];
  clone: CloneFacts | null;
}): TourContext {
  const index = buildIndexSummary(a.stats, a.cloneAvailable);
  return {
    generatedAt: a.generatedAt,
    repo: a.repo,
    index,
    indexUsable: isIndexUsable(a.stats),
    cloneAvailable: a.cloneAvailable,
    clone: a.clone,
    indexedPaths: new Set(a.files.map((f) => f.path)),
    ranked: rankFiles(a.files, a.stats.hotnessAvailable),
    structure: structureOf(a.files),
    stack: detectStack(a.clone, a.files),
    commands: deriveRunCommands(a.clone),
    skipped: a.clone?.skipped ?? [],
  };
}

// ---------------------------------------------------------------------------
// Facts (C3) and the token budget (AC-37, AC-39)
// ---------------------------------------------------------------------------

function capByTokens(text: string, cap: number, tokenizer: Tokenizer): string {
  let t = text;
  while (t.length > 0 && tokenizer.count(t) > cap) t = t.slice(0, Math.floor(t.length * 0.8));
  return t;
}

export function buildFacts(ctx: TourContext, repoMap: string | null, tokenizer: Tokenizer): OnboardingFacts {
  const { ranked } = ctx;
  const routes: OnboardingFacts['routes'] = [];
  for (const f of ranked) for (const endpoint of f.endpoints) routes.push({ endpoint, file: f.path });
  const scripts: OnboardingFacts['scripts'] = [];
  for (const m of ctx.clone?.manifests ?? []) {
    for (const name of Object.keys(m.scripts).sort(cmp)) {
      scripts.push({
        manifest: m.path,
        name,
        command: oneLine(m.scripts[name]!, SCRIPT_COMMAND_MAX_CHARS),
      });
    }
  }
  return {
    repo: { full_name: ctx.repo.fullName, default_branch: ctx.repo.defaultBranch },
    index: ctx.index,
    stack: ctx.stack,
    structure: ctx.structure,
    routes: routes.slice(0, ROUTES_MAX),
    scripts: scripts.slice(0, SCRIPTS_MAX),
    run_commands: ctx.commands.map((c) => ({ order: c.order, command: c.command })),
    critical_paths: ranked.slice(0, CRITICAL_PATHS_MAX).map((f) => ({
      path: f.path,
      importers: f.importers,
      endpoints: f.endpoints.length,
      rank_percentile: f.percentile,
    })),
    reading_path: ranked.slice(0, READING_PATH_MAX).map((f, i) => ({
      order: i + 1,
      path: f.path,
      importers: f.importers,
      rank_percentile: f.percentile,
    })),
    readme_excerpt: ctx.clone?.readme ? capByTokens(ctx.clone.readme, README_TOKEN_CAP, tokenizer) : null,
    repo_map: repoMap,
  };
}

export interface FittedFacts {
  facts: OnboardingFacts;
  tokens: number;
  truncated: boolean;
}

/**
 * AC-39: drop the lowest-ranked list items first (always the tail of the longest
 * rank-ordered list), then trim the README excerpt, then the repo map, until the
 * serialised facts fit `budget`.
 */
export function fitFacts(input: OnboardingFacts, tokenizer: Tokenizer, budget = FACTS_TOKEN_BUDGET): FittedFacts {
  const facts: OnboardingFacts = {
    ...input,
    routes: [...input.routes],
    scripts: [...input.scripts],
    reading_path: [...input.reading_path],
    critical_paths: [...input.critical_paths],
  };
  const count = () => tokenizer.count(stableJson(facts));
  let tokens = count();
  let truncated = false;

  const lists = ['routes', 'scripts', 'reading_path', 'critical_paths'] as const;
  while (tokens > budget) {
    let longest: (typeof lists)[number] | null = null;
    for (const k of lists) if (facts[k].length > 0 && (longest === null || facts[k].length > facts[longest].length)) longest = k;
    if (!longest) break;
    facts[longest].pop();
    truncated = true;
    tokens = count();
  }
  while (tokens > budget && facts.readme_excerpt) {
    const next = facts.readme_excerpt.slice(0, Math.floor(facts.readme_excerpt.length * 0.75));
    facts.readme_excerpt = next === '' ? null : next;
    truncated = true;
    tokens = count();
  }
  while (tokens > budget && facts.repo_map) {
    const next = facts.repo_map.slice(0, Math.floor(facts.repo_map.length * 0.75));
    facts.repo_map = next === '' ? null : next;
    truncated = true;
    tokens = count();
  }
  return { facts, tokens, truncated };
}

// ---------------------------------------------------------------------------
// Sections (skeleton and narrative merge)
// ---------------------------------------------------------------------------

const importedBy = (importers: number, endpoints: number) =>
  `Imported by ${importers} files${endpoints > 0 ? ` · ${endpoints} endpoints` : ''}`;

function stackLine(stack: Stack): string {
  const parts = [
    stack.package_manager ? `package manager: ${stack.package_manager}` : null,
    `${stack.ts_files} TS files`,
    `${stack.js_files} JS files`,
    stack.frameworks.length ? `frameworks: ${stack.frameworks.map(mdCode).join(', ')}` : null,
  ].filter(Boolean);
  return `**Stack:** ${parts.join(' · ')}`;
}

function skeletonArchitecture(ctx: TourContext): string {
  const lines: string[] = [];
  if (!ctx.cloneAvailable || !ctx.indexUsable) {
    lines.push(
      `**Repository:** ${mdCode(ctx.repo.fullName)}`,
      `**Default branch:** ${mdCode(ctx.repo.defaultBranch)}`,
      `**Index status:** ${ctx.index.status}`,
    );
  }
  if (ctx.cloneAvailable && ctx.indexUsable) lines.push(stackLine(ctx.stack));
  else if (ctx.clone && ctx.clone.manifests.length > 0) {
    const s = ctx.stack;
    lines.push(
      `**Stack:** ${[s.package_manager ? `package manager: ${s.package_manager}` : null, s.frameworks.length ? `frameworks: ${s.frameworks.map(mdCode).join(', ')}` : null].filter(Boolean).join(' · ')}`,
    );
  }
  if (ctx.indexUsable && ctx.structure.length > 0) {
    lines.push('', '**Top-level folders**', ...ctx.structure.map((s) => `- \`${mdCode(s.dir)}\` — ${s.files} files`));
  }
  return lines.join('\n');
}

interface Merged {
  architecture: { body: string; diagram: string | null; ai: boolean };
  critDesc: Map<string, string>;
  readReason: Map<string, string>;
  annotations: Map<number, string>;
  tasks: Array<{ title: string; rationale: string; paths: string[] }>;
  dropped: number;
}

/**
 * D11: validate and clamp the model's narrative. Cited paths must be indexed
 * (AC-54, counted); tasks with no valid path are dropped (AC-55); annotations
 * only attach to existing command orders (AC-41).
 */
export function mergeNarrative(ctx: TourContext, n: Narrative): Merged {
  let dropped = 0;
  const keyed = (rows: Array<{ path: string; text: string }>, max: number) => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!ctx.indexedPaths.has(r.path)) {
        dropped++;
        continue;
      }
      const text = oneLine(r.text, max);
      if (text !== '' && !m.has(r.path)) m.set(r.path, text);
    }
    return m;
  };
  const critDesc = keyed(
    n.critical_path_descriptions.map((r) => ({ path: r.path, text: r.description })),
    DESCRIPTION_MAX_CHARS,
  );
  const readReason = keyed(
    n.reading_path_reasons.map((r) => ({ path: r.path, text: r.reason })),
    DESCRIPTION_MAX_CHARS,
  );

  const maxOrder = ctx.commands.length;
  const annotations = new Map<number, string>();
  for (const a of n.command_annotations) {
    if (a.order < 1 || a.order > maxOrder) continue;
    const text = oneLine(a.annotation, ANNOTATION_MAX_CHARS);
    if (text !== '' && !annotations.has(a.order)) annotations.set(a.order, text);
  }

  const tasks: Merged['tasks'] = [];
  for (const t of n.first_tasks) {
    const cited = [...new Set(t.paths)];
    const valid = cited.filter((p) => ctx.indexedPaths.has(p));
    dropped += cited.length - valid.length;
    const title = oneLine(t.title, TASK_TITLE_MAX_CHARS);
    const rationale = oneLine(t.rationale, TASK_RATIONALE_MAX_CHARS);
    if (valid.length === 0 || title === '' || rationale === '') continue;
    tasks.push({ title, rationale, paths: valid.slice(0, FIRST_TASK_PATHS_MAX) });
  }

  const prose = cleanProse(n.architecture.prose_markdown, PROSE_MAX_CHARS);
  return {
    architecture: {
      body: prose,
      diagram: prose === '' ? null : cleanDiagram(n.architecture.diagram),
      ai: prose !== '',
    },
    critDesc,
    readReason,
    annotations,
    tasks,
    dropped,
  };
}

const base = (kind: keyof typeof SECTION_TITLES) => ({ title: SECTION_TITLES[kind] });

export function buildSections(
  ctx: TourContext,
  narrative: Narrative | null,
): { sections: OnboardingSection[]; dropped: number } {
  const m = narrative ? mergeNarrative(ctx, narrative) : null;

  const architecture: OnboardingSection = m?.architecture.ai
    ? {
        kind: 'architecture_overview',
        ...base('architecture_overview'),
        provenance: 'ai_written',
        available: true,
        unavailable_reason: null,
        body_markdown: m.architecture.body,
        diagram: m.architecture.diagram,
        items: [],
      }
    : {
        kind: 'architecture_overview',
        ...base('architecture_overview'),
        provenance: 'from_index',
        available: true,
        unavailable_reason: null,
        body_markdown: skeletonArchitecture(ctx),
        diagram: null,
        items: [],
      };

  const noIndex = <K extends 'critical_paths' | 'reading_path'>(kind: K) => ({
    kind,
    ...base(kind),
    provenance: 'from_index' as const,
    available: false,
    unavailable_reason: INDEX_UNAVAILABLE_SECTION_REASON,
    body_markdown: null,
    diagram: null,
    items: [] as never[],
  });

  const critical: OnboardingSection = !ctx.indexUsable
    ? noIndex('critical_paths')
    : (() => {
        const items = ctx.ranked.slice(0, CRITICAL_PATHS_MAX).map((f) => {
          const ai = m?.critDesc.get(f.path);
          return {
            path: f.path,
            description: ai ?? importedBy(f.importers, f.endpoints.length),
            description_provenance: ai ? ('ai_written' as const) : ('from_index' as const),
            importers: f.importers,
            endpoints: f.endpoints.length,
            rank_percentile: f.percentile,
          };
        });
        return {
          kind: 'critical_paths' as const,
          ...base('critical_paths'),
          provenance: items.some((i) => i.description_provenance === 'ai_written') ? ('ai_written' as const) : ('from_index' as const),
          available: true,
          unavailable_reason: null,
          body_markdown: null,
          diagram: null,
          items,
        };
      })();

  const runLocally: OnboardingSection = !ctx.cloneAvailable
    ? {
        kind: 'run_locally',
        ...base('run_locally'),
        provenance: 'from_index',
        available: false,
        unavailable_reason: NO_CLONE_RUN_REASON,
        body_markdown: null,
        diagram: null,
        items: [],
      }
    : (() => {
        const items = ctx.commands.map((c) => ({
          order: c.order,
          command: c.command,
          annotation: m?.annotations.get(c.order) ?? null,
          source_path: c.source_path,
        }));
        return {
          kind: 'run_locally' as const,
          ...base('run_locally'),
          provenance: items.some((i) => i.annotation !== null) ? ('ai_written' as const) : ('from_index' as const),
          available: true,
          unavailable_reason: null,
          body_markdown: null,
          diagram: null,
          items,
        };
      })();

  const reading: OnboardingSection = !ctx.indexUsable
    ? noIndex('reading_path')
    : (() => {
        const items = ctx.ranked.slice(0, READING_PATH_MAX).map((f, i) => {
          const ai = m?.readReason.get(f.path);
          return {
            order: i + 1,
            path: f.path,
            reason: ai ?? `Imported by ${f.importers} files`,
            reason_provenance: ai ? ('ai_written' as const) : ('from_index' as const),
            rank_percentile: f.percentile,
            score: f.score,
          };
        });
        return {
          kind: 'reading_path' as const,
          ...base('reading_path'),
          provenance: items.some((i) => i.reason_provenance === 'ai_written') ? ('ai_written' as const) : ('from_index' as const),
          available: true,
          unavailable_reason: null,
          body_markdown: null,
          diagram: null,
          items,
        };
      })();

  const unavailableTasks = (reason: string): OnboardingSection => ({
    kind: 'first_tasks',
    ...base('first_tasks'),
    provenance: 'from_index',
    available: false,
    unavailable_reason: reason,
    body_markdown: null,
    diagram: null,
    items: [],
  });
  const firstTasks: OnboardingSection = !m
    ? unavailableTasks(FIRST_TASKS_SKELETON_REASON)
    : m.tasks.length < FIRST_TASKS_MIN
      ? unavailableTasks(FIRST_TASKS_TOO_FEW_REASON)
      : {
          kind: 'first_tasks',
          ...base('first_tasks'),
          provenance: 'ai_written',
          available: true,
          unavailable_reason: null,
          body_markdown: null,
          diagram: null,
          items: m.tasks.slice(0, FIRST_TASKS_MAX),
        };

  return {
    sections: [architecture, critical, runLocally, reading, firstTasks],
    dropped: m?.dropped ?? 0,
  };
}

export const NO_LLM: OnboardingLlmUsage = {
  calls: 0,
  call_id: null,
  attempts: null,
  provider: null,
  model: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
};

export function buildTour(a: {
  ctx: TourContext;
  narrative: Narrative | null;
  skeletonReason: OnboardingSkeletonReason | null;
  llm: OnboardingLlmUsage;
  factsTruncated: boolean;
}): OnboardingTour {
  const { sections, dropped } = buildSections(a.ctx, a.narrative);
  const reasons = partialReasons(a.ctx.index, a.factsTruncated);
  const narrative = a.narrative !== null;
  return {
    generated_at: a.ctx.generatedAt,
    mode: narrative ? 'narrative' : 'skeleton',
    skeleton_reason: narrative ? null : a.skeletonReason,
    completeness: reasons.length > 0 ? 'partial' : 'full',
    partial_reasons: reasons,
    index: a.ctx.index,
    llm: a.llm,
    dropped_ai_items: dropped,
    skipped_files: a.ctx.skipped,
    sections,
  };
}

/** C5 — whitelist only: nothing is copied from facts, prompts, files or errors (AC-67). */
export function buildGeneratedRecord(a: {
  repoId: string;
  tour: OnboardingTour;
  factsTokens: number;
  durationMs: number;
}): GeneratedRecord {
  const { tour } = a;
  return {
    event: 'onboarding.generated',
    repo_id: a.repoId,
    mode: tour.mode,
    completeness: tour.completeness,
    skeleton_reason: tour.skeleton_reason,
    partial_reasons: [...tour.partial_reasons],
    llm_calls: tour.llm.calls,
    call_id: tour.llm.call_id,
    attempts: tour.llm.attempts,
    provider: tour.llm.provider,
    model: tour.llm.model,
    tokens_in: tour.llm.tokens_in,
    tokens_out: tour.llm.tokens_out,
    cost_usd: tour.llm.cost_usd,
    facts_tokens: a.factsTokens,
    dropped_ai_items: tour.dropped_ai_items,
    duration_ms: a.durationMs,
  };
}
