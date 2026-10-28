import { describe, it, expect } from 'vitest';
import { OnboardingTour } from '@devdigest/shared';
import type { OnboardingIndexStats, OnboardingSnapshotFile } from '../src/modules/repo-intel/types.js';
import type { CloneFacts, ParsedManifest } from '../src/modules/onboarding/clone-facts.js';
import type { Narrative } from '../src/modules/onboarding/prompt.js';
import {
  NO_LLM,
  buildFacts,
  buildGeneratedRecord,
  buildSections,
  buildTour,
  buildTourContext,
  deriveRunCommands,
  detectStack,
  fitFacts,
  isExcluded,
  oneLine,
  rankFiles,
  stableJson,
} from '../src/modules/onboarding/helpers.js';
import { FIRST_TASKS_TOO_FEW_REASON } from '../src/modules/onboarding/constants.js';

const tokenizer = { count: (t: string) => Math.ceil(t.length / 4) };

const stats = (o: Partial<OnboardingIndexStats> = {}): OnboardingIndexStats => ({
  enabled: true,
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  lastIndexedSha: 'sha1',
  totalCandidates: 10,
  bounded: 0,
  hotnessAvailable: false,
  ...o,
});

const file = (path: string, pagerank: number, o: Partial<OnboardingSnapshotFile> = {}): OnboardingSnapshotFile => ({
  path,
  pagerank,
  hotness: 0,
  rank: pagerank,
  percentile: 50,
  importers: 3,
  endpoints: [],
  ...o,
});

const manifest = (o: Partial<ParsedManifest> = {}): ParsedManifest => ({
  dir: '',
  path: 'package.json',
  name: 'x',
  scripts: {},
  dependencies: [],
  envExample: false,
  ...o,
});

const cloneFacts = (o: Partial<CloneFacts> = {}): CloneFacts => ({
  manifests: [manifest()],
  skipped: [],
  lockfilePm: null,
  composeFile: null,
  readme: null,
  ...o,
});

const FILES = [
  file('src/core.ts', 0.5, { percentile: 98, importers: 14, endpoints: ['GET /a', 'GET /b', 'GET /c'] }),
  file('src/b.ts', 0.3),
  file('src/a.ts', 0.3),
  file('src/z.ts', 0.1),
  file('test/helper.ts', 0.9),
  file('src/x.test.ts', 0.8),
];

const mkCtx = (o: { files?: OnboardingSnapshotFile[]; clone?: CloneFacts | null; stats?: Partial<OnboardingIndexStats>; cloneAvailable?: boolean } = {}) =>
  buildTourContext({
    generatedAt: '2026-10-11T10:00:00.000Z',
    repo: { fullName: 'acme/x', defaultBranch: 'main' },
    stats: stats(o.stats),
    cloneAvailable: o.cloneAvailable ?? true,
    files: o.files ?? FILES,
    clone: o.clone === undefined ? cloneFacts() : o.clone,
  });

const emptyNarrative = (o: Partial<Narrative> = {}): Narrative => ({
  architecture: { prose_markdown: 'Prose', diagram: null },
  critical_path_descriptions: [],
  reading_path_reasons: [],
  command_annotations: [],
  first_tasks: [],
  ...o,
});
const task = (title: string, paths: string[]) => ({ title, rationale: `why ${title}`, paths });

describe('ranking and exclusions (AC-47, AC-49, AC-74)', () => {
  it('excludes tests, root test dirs and configs but not source', () => {
    expect(isExcluded('test/helper.ts')).toBe(true);
    expect(isExcluded('src/x.test.ts')).toBe(true);
    expect(isExcluded('src/types.d.ts')).toBe(true);
    expect(isExcluded('src/generated/api.ts')).toBe(true);
    expect(isExcluded('vitest.config.ts')).toBe(true);
    expect(isExcluded('src/core.ts')).toBe(false);
  });

  it('orders by score desc and breaks ties by path asc', () => {
    expect(rankFiles(FILES, false).map((f) => f.path)).toEqual(['src/core.ts', 'src/a.ts', 'src/b.ts', 'src/z.ts']);
  });

  it('score is pagerank while hotness is unavailable, pagerank*(1+hotness) otherwise (AC-50)', () => {
    const f = [file('src/a.ts', 0.2, { hotness: 1 })];
    expect(rankFiles(f, false)[0]!.score).toBe(0.2);
    expect(rankFiles(f, true)[0]!.score).toBeCloseTo(0.4);
  });

  it('AC-74: only excluded files -> both file sections are empty but available', () => {
    const ctx = mkCtx({ files: [file('test/a.ts', 1), file('src/a.test.ts', 1)] });
    const { sections } = buildSections(ctx, null);
    expect(sections[1]).toMatchObject({ kind: 'critical_paths', available: true, items: [] });
    expect(sections[3]).toMatchObject({ kind: 'reading_path', available: true, items: [] });
  });

  it('caps critical paths at 8 and reading path at 10 in rank order (AC-47, AC-49)', () => {
    const files = Array.from({ length: 30 }, (_, i) => file(`src/f${String(i).padStart(2, '0')}.ts`, 1 - i / 100));
    const { sections } = buildSections(mkCtx({ files }), null);
    expect((sections[1]!.items as unknown[]).length).toBe(8);
    const reading = sections[3]!.items as Array<{ order: number; path: string }>;
    expect(reading.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(reading[0]!.path).toBe('src/f00.ts');
  });
});

describe('stack and run commands (AC-38, AC-40, AC-41, AC-42)', () => {
  it('AC-38: pnpm lockfile + fastify dependency', () => {
    const clone = cloneFacts({ lockfilePm: 'pnpm', manifests: [manifest({ dependencies: ['fastify', 'left-pad'] })] });
    const stack = detectStack(clone, FILES);
    expect(stack).toMatchObject({ package_manager: 'pnpm', ts_files: 6, js_files: 0, frameworks: ['fastify'] });
  });

  it('npm is the default when a manifest exists without a lockfile; null without a manifest', () => {
    expect(detectStack(cloneFacts(), []).package_manager).toBe('npm');
    expect(detectStack(cloneFacts({ manifests: [] }), []).package_manager).toBeNull();
    expect(detectStack(null, []).package_manager).toBeNull();
  });

  it('AC-40: the design fixture yields exactly the four commands', () => {
    const clone = cloneFacts({
      lockfilePm: 'pnpm',
      composeFile: 'docker-compose.yml',
      manifests: [manifest({ envExample: true, scripts: { dev: 'x', start: 'y' } })],
    });
    expect(deriveRunCommands(clone).map((c) => c.command)).toEqual([
      'pnpm install',
      'cp .env.example .env',
      'docker compose up -d',
      'pnpm run dev',
    ]);
    expect(deriveRunCommands(clone).map((c) => c.order)).toEqual([1, 2, 3, 4]);
  });

  it('start is used when there is no dev script', () => {
    const clone = cloneFacts({ manifests: [manifest({ scripts: { start: 'node .' } })] });
    expect(deriveRunCommands(clone).map((c) => c.command)).toEqual(['npm install', 'npm start']);
  });

  it('no root manifest: up to 3 child installs in path order', () => {
    const clone = cloneFacts({
      lockfilePm: 'yarn',
      manifests: ['a', 'b', 'c', 'd'].map((dir) => manifest({ dir, path: `${dir}/package.json`, envExample: dir === 'b' })),
    });
    expect(deriveRunCommands(clone).map((c) => c.command)).toEqual([
      'cd a && yarn install',
      'cd b && yarn install',
      'cd c && yarn install',
      'cd b && cp .env.example .env',
    ]);
  });

  it('a child folder name that is unsafe in a shell is never offered', () => {
    const clone = cloneFacts({ manifests: [manifest({ dir: 'a; rm -rf ~', path: 'a; rm -rf ~/package.json' })] });
    expect(deriveRunCommands(clone)).toEqual([]);
  });

  it('AC-42 input: no manifest -> no commands', () => {
    expect(deriveRunCommands(cloneFacts({ manifests: [] }))).toEqual([]);
    expect(deriveRunCommands(null)).toEqual([]);
  });

  it('AC-41: annotating order 9 or an unknown order changes nothing; commands are untouched', () => {
    const clone = cloneFacts({ manifests: [manifest({ scripts: { dev: 'x' } })] });
    const ctx = mkCtx({ clone });
    const n = emptyNarrative({
      command_annotations: [
        { order: 9, annotation: 'invented' },
        { order: 1, annotation: 'line1\n rm -rf /' },
      ],
    });
    const run = buildSections(ctx, n).sections[2]!;
    const items = run.items as Array<{ order: number; command: string; annotation: string | null }>;
    expect(items.map((i) => i.command)).toEqual(['npm install', 'npm run dev']);
    expect(items[0]!.annotation).toBe('line1 rm -rf /');
    expect(items[1]!.annotation).toBeNull();
    expect(run.provenance).toBe('ai_written');
    expect(buildSections(ctx, null).sections[2]!.provenance).toBe('from_index');
  });

  it('AC-59: annotations are single-line, control-free and at most 80 chars', () => {
    const s = oneLine('a\n\tb\u0000c\r\n' + 'x'.repeat(200), 80);
    expect(s).not.toMatch(/[\n\r\t\u0000]/);
    expect(s.length).toBeLessThanOrEqual(80);
  });
});

describe('facts (AC-37, AC-39, AC-60)', () => {
  it('AC-37: same inputs give byte-identical facts', () => {
    const a = stableJson(buildFacts(mkCtx(), 'MAP', tokenizer));
    const b = stableJson(buildFacts(mkCtx(), 'MAP', tokenizer));
    expect(a).toBe(b);
  });

  it('routes come from endpoint-bearing ranked files; excluded files are not listed', () => {
    const facts = buildFacts(mkCtx(), null, tokenizer);
    expect(facts.routes).toEqual([
      { endpoint: 'GET /a', file: 'src/core.ts' },
      { endpoint: 'GET /b', file: 'src/core.ts' },
      { endpoint: 'GET /c', file: 'src/core.ts' },
    ]);
    expect(facts.critical_paths[0]).toMatchObject({ path: 'src/core.ts', importers: 14, endpoints: 3, rank_percentile: 98 });
  });

  it('AC-39: oversize facts are trimmed to the budget, lowest-ranked first, and flagged', () => {
    const files = Array.from({ length: 400 }, (_, i) => file(`src/f${i}.ts`, 1 - i / 1000, { endpoints: [`GET /r${i}/${'x'.repeat(60)}`] }));
    const clone = cloneFacts({ readme: 'R'.repeat(40_000) });
    const raw = buildFacts(mkCtx({ files, clone }), 'M'.repeat(24_000), tokenizer);
    expect(tokenizer.count(stableJson(raw))).toBeGreaterThan(8000);
    const fit = fitFacts(raw, tokenizer);
    expect(fit.tokens).toBeLessThanOrEqual(8000);
    expect(fit.truncated).toBe(true);
    expect(fit.facts.critical_paths[0]!.path).toBe('src/f0.ts');
    const tour = buildTour({ ctx: mkCtx({ files, clone }), narrative: null, skeletonReason: 'llm_failed', llm: NO_LLM, factsTruncated: fit.truncated });
    expect(tour.partial_reasons).toContain('facts_truncated');
    expect(tour.completeness).toBe('partial');
  });

  it('small facts are not flagged', () => {
    const fit = fitFacts(buildFacts(mkCtx(), null, tokenizer), tokenizer);
    expect(fit.truncated).toBe(false);
  });

  it('AC-30: capped, partial and skipped indexes list their partial reasons', () => {
    const ctx = mkCtx({ stats: { status: 'partial', bounded: 7450, totalCandidates: 12450, filesSkipped: 2 } });
    const tour = buildTour({ ctx, narrative: null, skeletonReason: 'llm_failed', llm: NO_LLM, factsTruncated: false });
    expect(tour.partial_reasons).toEqual(['index_partial', 'index_capped', 'files_skipped']);
    expect(tour.index).toMatchObject({ source_files_total: 12450, files_bounded: 7450 });
  });
});

describe('skeleton sections (AC-46, AC-48, AC-51, AC-53, D10)', () => {
  it('AC-46: the skeleton architecture carries the stack line and folder list in body_markdown', () => {
    const files = [file('src/a.ts', 1), file('src/b.ts', 0.9), file('lib/c.js', 0.8), file('top.ts', 0.7)];
    const ctx = mkCtx({ files, clone: cloneFacts({ lockfilePm: 'pnpm', manifests: [manifest({ dependencies: ['react'] })] }) });
    const arch = buildSections(ctx, null).sections[0]!;
    expect(arch).toMatchObject({ kind: 'architecture_overview', provenance: 'from_index', diagram: null, available: true });
    expect(arch.body_markdown).toContain('**Stack:** package manager: pnpm · 3 TS files · 1 JS files · frameworks: react');
    expect(arch.body_markdown).toContain('- `src` — 2 files');
    expect(arch.body_markdown).toContain('- `lib` — 1 files');
    expect(arch.body_markdown!.indexOf('`src`')).toBeLessThan(arch.body_markdown!.indexOf('`lib`'));
  });

  it('folders are capped at 15', () => {
    const files = Array.from({ length: 20 }, (_, i) => file(`d${String(i).padStart(2, '0')}/a.ts`, 0.5));
    const arch = buildSections(mkCtx({ files }), null).sections[0]!;
    expect(arch.body_markdown!.match(/^- `/gm)).toHaveLength(15);
  });

  it('no_clone: architecture shows metadata, run commands unavailable, index sections still from the index', () => {
    const ctx = mkCtx({ cloneAvailable: false, clone: null });
    const { sections } = buildSections(ctx, null);
    expect(sections[0]!.body_markdown).toContain('**Repository:** acme/x');
    expect(sections[0]!.body_markdown).toContain('**Default branch:** main');
    expect(sections[0]!.body_markdown).toContain('**Index status:** full');
    expect(sections[2]).toMatchObject({ kind: 'run_locally', available: false, items: [] });
    expect((sections[1]!.items as unknown[]).length).toBeGreaterThan(0);
  });

  it('index_unavailable: file sections unavailable, run commands still derived', () => {
    const ctx = mkCtx({ stats: { status: 'degraded' } });
    const { sections } = buildSections(ctx, null);
    expect(sections[1]).toMatchObject({ available: false, items: [] });
    expect(sections[3]).toMatchObject({ available: false, items: [] });
    expect(sections[2]).toMatchObject({ available: true });
    expect((sections[2]!.items as unknown[]).length).toBe(1);
  });

  it('AC-48/AC-51: skeleton rows use the deterministic text with from_index provenance', () => {
    const { sections } = buildSections(mkCtx(), null);
    const crit = sections[1]!.items as Array<{ description: string; description_provenance: string }>;
    expect(crit[0]).toMatchObject({ description: 'Imported by 14 files · 3 endpoints', description_provenance: 'from_index' });
    const reading = sections[3]!.items as Array<{ reason: string; rank_percentile: number }>;
    expect(reading[0]).toMatchObject({ reason: 'Imported by 14 files', rank_percentile: 98 });
    expect(sections.every((s) => s.provenance === 'from_index')).toBe(true);
  });

  it('AC-53: First tasks are unavailable in a skeleton', () => {
    expect(buildSections(mkCtx(), null).sections[4]).toMatchObject({
      kind: 'first_tasks',
      available: false,
      items: [],
      unavailable_reason: 'First tasks are written by the AI narrative — unavailable in the skeleton.',
    });
  });

  it('a skeleton tour is contract-valid and has the five sections in order', () => {
    const tour = buildTour({ ctx: mkCtx(), narrative: null, skeletonReason: 'no_import_graph', llm: NO_LLM, factsTruncated: false });
    expect(() => OnboardingTour.parse(tour)).not.toThrow();
    expect(tour.sections.map((s) => s.kind)).toEqual(['architecture_overview', 'critical_paths', 'run_locally', 'reading_path', 'first_tasks']);
    expect(tour).toMatchObject({ mode: 'skeleton', skeleton_reason: 'no_import_graph' });
  });
});

describe('narrative merge (AC-45, AC-52..AC-56, AC-77)', () => {
  const ok = ['src/core.ts', 'src/a.ts', 'src/b.ts', 'src/z.ts'];

  it('AC-45: prose is clamped to 1,200 chars and a diagram is kept', () => {
    const n = emptyNarrative({ architecture: { prose_markdown: 'p'.repeat(2000), diagram: 'flowchart LR\n A-->B' } });
    const arch = buildSections(mkCtx(), n).sections[0]!;
    expect(arch.body_markdown).toHaveLength(1200);
    expect(arch).toMatchObject({ provenance: 'ai_written', diagram: 'flowchart LR\n A-->B' });
  });

  it('descriptions and reasons for listed paths are used; a missing one falls back (AC-56)', () => {
    const n = emptyNarrative({
      critical_path_descriptions: [{ path: 'src/core.ts', description: 'The core' }],
      reading_path_reasons: [{ path: 'src/core.ts', reason: 'Start here' }],
    });
    const { sections } = buildSections(mkCtx(), n);
    const crit = sections[1]!.items as Array<{ path: string; description: string; description_provenance: string }>;
    expect(crit[0]).toMatchObject({ description: 'The core', description_provenance: 'ai_written' });
    expect(crit[1]).toMatchObject({ description: 'Imported by 3 files', description_provenance: 'from_index' });
    const reading = sections[3]!.items as Array<{ reason: string; reason_provenance: string }>;
    expect(reading[0]).toMatchObject({ reason: 'Start here', reason_provenance: 'ai_written' });
    expect(reading[1]).toMatchObject({ reason: 'Imported by 3 files', reason_provenance: 'from_index' });
  });

  it('AC-54: unknown paths are dropped and counted; the row keeps its fallback', () => {
    const n = emptyNarrative({
      critical_path_descriptions: [{ path: 'src/ghost.ts', description: 'invented' }],
      first_tasks: [task('T1', ok.slice(0, 1)), task('T2', ok.slice(1, 2)), task('T3', ok.slice(2, 3)), task('G', ['src/ghost.ts', 'src/a.ts'])],
    });
    const { sections, dropped } = buildSections(mkCtx(), n);
    expect(dropped).toBe(2);
    expect(JSON.stringify(sections)).not.toContain('invented');
    expect(JSON.stringify(sections[4])).not.toContain('ghost');
  });

  it('AC-55: a task with no valid path is absent', () => {
    const n = emptyNarrative({
      first_tasks: [task('T1', ['src/core.ts']), task('T2', ['src/a.ts']), task('T3', ['src/b.ts']), task('Ghost', ['src/ghost.ts'])],
    });
    const items = buildSections(mkCtx(), n).sections[4]!.items as Array<{ title: string }>;
    expect(items.map((i) => i.title)).toEqual(['T1', 'T2', 'T3']);
  });

  it('AC-52: 4 valid tasks render 4; 6 valid render 5; paths are capped at 3', () => {
    const four = emptyNarrative({ first_tasks: ['A', 'B', 'C', 'D'].map((t, i) => task(t, [ok[i % 4]!])) });
    expect(buildSections(mkCtx(), four).sections[4]).toMatchObject({ available: true, provenance: 'ai_written' });
    expect(buildSections(mkCtx(), four).sections[4]!.items).toHaveLength(4);
    const six = emptyNarrative({ first_tasks: ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => task(t, ok.slice(0, (i % 4) + 1))) });
    const items = buildSections(mkCtx(), six).sections[4]!.items as Array<{ paths: string[] }>;
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.paths.length <= 3)).toBe(true);
  });

  it('AC-77: 3 tasks of which 2 cite only a ghost -> unavailable, items empty, narrative mode, only 2 counted', () => {
    const n = emptyNarrative({
      first_tasks: [task('Good', ['src/core.ts']), task('Bad1', ['src/ghost.ts']), task('Bad2', ['src/ghost.ts'])],
    });
    const tour = buildTour({
      ctx: mkCtx(),
      narrative: n,
      skeletonReason: null,
      llm: { ...NO_LLM, calls: 1, call_id: 'c' },
      factsTruncated: false,
    });
    expect(tour.mode).toBe('narrative');
    expect(tour.dropped_ai_items).toBe(2);
    expect(tour.sections[4]).toMatchObject({
      kind: 'first_tasks',
      available: false,
      items: [],
      provenance: 'from_index',
      unavailable_reason: FIRST_TASKS_TOO_FEW_REASON,
    });
    expect(FIRST_TASKS_TOO_FEW_REASON).toBe('Fewer than 3 AI-written first tasks cited files in the index — unavailable for this tour.');
    expect(() => OnboardingTour.parse(tour)).not.toThrow();
  });

  it('AC-77: exactly 3 valid tasks stay available', () => {
    const n = emptyNarrative({ first_tasks: [task('A', ['src/core.ts']), task('B', ['src/a.ts']), task('C', ['src/b.ts'])] });
    expect(buildSections(mkCtx(), n).sections[4]).toMatchObject({ available: true });
  });

  it('an empty prose falls back to the deterministic architecture body', () => {
    const arch = buildSections(mkCtx(), emptyNarrative({ architecture: { prose_markdown: '  ', diagram: null } })).sections[0]!;
    expect(arch).toMatchObject({ provenance: 'from_index' });
    expect(arch.body_markdown).toContain('**Stack:**');
  });

  it('a fenced or oversized diagram is cleaned or omitted', () => {
    const fenced = emptyNarrative({ architecture: { prose_markdown: 'p', diagram: '```mermaid\nflowchart TD\n A-->B\n```' } });
    expect(buildSections(mkCtx(), fenced).sections[0]!.diagram).toBe('flowchart TD\n A-->B');
    const big = emptyNarrative({ architecture: { prose_markdown: 'p', diagram: 'x'.repeat(5000) } });
    expect(buildSections(mkCtx(), big).sections[0]!.diagram).toBeNull();
  });
});

describe('C5 record (AC-64, AC-67, AC-82)', () => {
  it('copies only whitelisted fields; no prompt, README or key text can appear', () => {
    const SECRET = 'SENTINEL-README-AND-KEY-sk-or-v1-zzz';
    const ctx = mkCtx({ clone: cloneFacts({ readme: SECRET }) });
    const tour = buildTour({
      ctx,
      narrative: emptyNarrative({ architecture: { prose_markdown: SECRET, diagram: null } }),
      skeletonReason: null,
      llm: { calls: 1, call_id: 'cid', attempts: 2, provider: 'openai', model: 'gpt-4o-mini', tokens_in: 6000, tokens_out: 1200, cost_usd: 0.0123 },
      factsTruncated: false,
    });
    const rec = buildGeneratedRecord({ repoId: 'r1', tour, factsTokens: 4321, durationMs: 77 });
    expect(Object.keys(rec).sort()).toEqual(
      [
        'event', 'repo_id', 'mode', 'completeness', 'skeleton_reason', 'partial_reasons', 'llm_calls', 'call_id',
        'attempts', 'provider', 'model', 'tokens_in', 'tokens_out', 'cost_usd', 'facts_tokens', 'dropped_ai_items', 'duration_ms',
      ].sort(),
    );
    expect(rec).toMatchObject({ event: 'onboarding.generated', llm_calls: 1, call_id: 'cid', attempts: 2, cost_usd: 0.0123, facts_tokens: 4321 });
    expect(JSON.stringify(rec)).not.toContain('SENTINEL');
  });
});
