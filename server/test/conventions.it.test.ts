import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel, CodeIndex } from '@devdigest/shared';

/**
 * End-to-end cover for the extractor's contract with the outside world: the
 * evidence gate really drops an invented citation, a re-scan really preserves
 * the user's decisions, and the accepted set really becomes a skill.
 *
 * The model is mocked (fixtures keyed by schemaName) and the "clone" is a temp
 * directory, so the only thing under test is our own three stages.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const STYLES = `import type { CSSProperties } from 'react';

export const s = {
  card: { display: 'flex' },
} as const;
`;

/** One grounded candidate, one with an invented snippet the gate must drop. */
const EXTRACTION = {
  candidates: [
    {
      rule: 'Co-located styles live in a styles.ts exporting a single object named s',
      evidence_path: 'src/widget/styles.ts',
      evidence_line: 99, // deliberately wrong — must be CORRECTED, not fatal
      evidence_snippet: 'export const s = {',
      probe_literal: 'export const s = {',
      occurrences_seen: 4,
      rationale: 'Flag inline style objects declared in the component file.',
      category: 'styling',
      confidence: 0.92,
    },
    {
      rule: 'Every module exports a barrel named index.ts',
      evidence_path: 'src/widget/styles.ts',
      evidence_line: 2,
      evidence_snippet: 'export * from "./totally-invented-barrel";',
      probe_literal: 'export * from',
      occurrences_seen: 9,
      rationale: 'Invented — must not survive the gate.',
      category: 'structure',
      confidence: 0.88,
    },
  ],
};

d('Conventions extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    clonePath = await mkdtemp(join(tmpdir(), 'conv-'));
    await mkdir(join(clonePath, 'src', 'widget'), { recursive: true });
    await writeFile(join(clonePath, 'src', 'widget', 'styles.ts'), STYLES, 'utf8');
    await writeFile(join(clonePath, 'package.json'), '{"name":"fixture"}', 'utf8');

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'fixture',
        fullName: 'acme/fixture',
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const repoIntel = {
    getConventionSamples: async () => ['src/widget/styles.ts'],
  } as unknown as RepoIntel;

  const codeIndex = {
    grep: async () => [
      { path: 'a/styles.ts', line: 3, text: 'export const s = {' },
      { path: 'b/styles.ts', line: 3, text: 'export const s = {' },
    ],
  } as unknown as CodeIndex;

  const app = async (structured: unknown = EXTRACTION) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        codeIndex,
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: structured } }) },
      },
    });

  it('drops the invented candidate, corrects the wrong line, counts occurrences', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.proposed).toBe(2);
    expect(body.dropped_ungrounded).toBe(1);
    expect(body.candidates).toHaveLength(1);

    const kept = body.candidates[0];
    expect(kept.rule).toContain('Co-located styles');
    // The claimed line was 99; the gate found it at 3 and corrected it.
    expect(kept.evidence_line).toBe(3);
    // The snippet shown is sliced from the FILE, not taken from the model.
    expect(kept.evidence_snippet).toContain('export const s = {');
    // Frequency is measured by grep over distinct files, not self-reported.
    expect(kept.occurrences).toBe(2);
    expect(kept.status).toBe('pending');
  });

  it('persists across a fresh app instance (survives a restart)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('a re-scan replaces only pending rows — a rejected rule never comes back', async () => {
    const a = await app();
    const [row] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));

    const rejected = await a.inject({
      method: 'PATCH',
      url: `/conventions/${row!.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);

    const rescan = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(rescan.statusCode).toBe(200);
    // The model proposed it again, but it was deduped against the decided rule.
    expect(rescan.json().dropped_duplicate).toBe(1);

    const after = await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const rows = after.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('rejected');
  });

  it('edits inline, then drafts a skill from the accepted set and persists it', async () => {
    const a = await app();
    const [row] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));

    // Nothing accepted yet → drafting is a clean 422, not an empty skill.
    const tooEarly = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` });
    expect(tooEarly.statusCode).toBe(422);

    const edited = await a.inject({
      method: 'PATCH',
      url: `/conventions/${row!.id}`,
      payload: { rule: 'Styles live in styles.ts as `s`', status: 'accepted' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().rule).toBe('Styles live in styles.ts as `s`');

    const draft = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill` });
    expect(draft.statusCode).toBe(200);
    const d = draft.json();
    expect(d.name).toBe('repo-conventions');
    expect(d.type).toBe('convention');
    expect(d.body).toContain('Styles live in styles.ts as `s`');
    expect(d.evidence_files).toEqual(['src/widget/styles.ts']);

    // The draft persists NOTHING — it becomes a skill only through POST /skills.
    const before = await a.inject({ method: 'GET', url: '/skills' });
    const created = await a.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: d.name,
        description: d.description,
        type: d.type,
        body: d.body,
        source: 'extracted',
        evidence_files: d.evidence_files,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().source).toBe('extracted');
    expect(created.json().evidence_files).toEqual(['src/widget/styles.ts']);

    const after = await a.inject({ method: 'GET', url: '/skills' });
    expect(after.json().length).toBe(before.json().length + 1);
  });

  it('422s before any model call when the repo has no clone', async () => {
    const [bare] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'bare', fullName: 'acme/bare', defaultBranch: 'main' })
      .returning();
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    const a = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel, codeIndex, llm: { openai: llm } },
    });
    const res = await a.inject({ method: 'POST', url: `/repos/${bare!.id}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    // The point of the early 422: we never paid for a model call.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
  });

  it('deletes a candidate', async () => {
    const a = await app();
    const [row] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    const del = await a.inject({ method: 'DELETE', url: `/conventions/${row!.id}` });
    expect(del.statusCode).toBe(204);
    const after = await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(after.json()).toHaveLength(0);
  });
});
