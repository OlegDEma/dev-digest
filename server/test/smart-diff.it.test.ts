import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SmartDiffResponse } from '@devdigest/shared';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-api-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Smart diff',
      author: 'a',
      branch: 'feat',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 4,
      deletions: 0,
      filesCount: 4,
      status: 'needs_review',
      body: '',
    })
    .returning();
  await db.insert(t.prFiles).values(
    ['src/a.ts', 'pnpm-lock.yaml', 'README.md', 'src/a.test.ts'].map((path) => ({
      prId: pr!.id,
      path,
      additions: 1,
      deletions: 0,
      patch: null,
    })),
  );
  return pr!;
}

d('smart-diff route (pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function app() {
    const llm = new MockLLMProvider('openai', {});
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({}),
        github: new MockGitHubClient({}),
        llm: { openai: llm, openrouter: llm },
      },
    });
  }

  it('groups files by role, reports finding lines, 404s a foreign workspace, 4xx on bad id', async () => {
    const a = await app();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.groups.map((g) => g.files.length)).toEqual([1, 1, 0, 1, 1]);
    expect(body.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
    expect(body.split_suggestion.too_big).toBe(false);
    expect(body.split_suggestion.proposed_splits).toEqual([]);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/a.ts',
      startLine: 3,
      endLine: 3,
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.8,
    });
    const after = SmartDiffResponse.parse(
      (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json(),
    );
    expect(after.groups[0]!.files[0]!.finding_lines).toEqual([3]);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await setupPr(pg.handle.db, other!.id);
    expect((await a.inject({ method: 'GET', url: `/pulls/${foreign.id}/smart-diff` })).statusCode).toBe(404);

    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);

    await a.close();
  });
});
