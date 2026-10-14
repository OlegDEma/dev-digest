import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { FsCloneDocs } from '../src/adapters/clone-docs/index.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (nodeEnv = 'test') => loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@ export const config = {
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const BRIEF = {
  summary: 'Adds a Stripe key to config.',
  risks: [
    { kind: 'secret', title: 'Hardcoded secret', explanation: 'A live key is committed.', severity: 'high', file_refs: ['src/config.ts:11', 'src/invented.ts:3'] },
    { kind: 'ghost', title: 'Ghost', explanation: 'x', severity: 'low', file_refs: ['nope.ts'] },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 11, reason: 'the key' },
    { file: 'src/invented.ts', line: 1, reason: 'invented' },
  ],
};

let seq = 0;
async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  o: { body?: string | null; clonePath?: string | null; files?: boolean } = {},
) {
  const name = `brief-api-${seq++}-${randomUUID().slice(0, 8)}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: o.clonePath ?? null })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId, repoId: repo!.id, number: 7, title: 'Add config', author: 'a', branch: 'feat', base: 'main',
      headSha: 'a1b2c3d4', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      body: o.body === undefined ? 'Adds config.' : o.body,
    })
    .returning();
  if (o.files !== false) {
    await db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
  }
  return pr!;
}

d('PR brief (pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const tmp = mkdtempSync(join(tmpdir(), 'brief-it-'));

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    mkdirSync(join(tmp, 'specs'), { recursive: true });
    writeFileSync(join(tmp, 'specs', 'plan.md'), 'Never commit live keys.');
  });
  afterAll(async () => {
    await pg?.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  function appWith(llm: MockLLMProvider, nodeEnv = 'test') {
    return buildApp({
      config: config(nodeEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        cloneDocs: new FsCloneDocs(),
        llm: { openai: llm, openrouter: llm },
      },
    });
  }
  const mock = () => new MockLLMProvider('openai', { structuredBySchema: { PrBriefModelOutput: BRIEF } });
  const calls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

  it('POST stores, GET returns the same brief with zero model calls; head change → stale; foreign PR 404s (AC-29..31, AC-64)', async () => {
    const llm = mock();
    const app = await appWith(llm);
    const pr = await setupPr(pg.handle.db, workspaceId);

    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json()).toEqual({ brief: null, stale: false });

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(post.statusCode).toBe(200);
    const brief = post.json().brief;
    expect(brief).toMatchObject({ calls: 1, attempts: 1, head_sha: 'a1b2c3d4', model: 'gpt-4.1', provider: 'openai', input_budget: 8000 });
    expect(brief.input_tokens).toBeLessThanOrEqual(8000);
    expect(brief.history).toBeNull();
    expect(calls(llm)).toHaveLength(1);

    const t0 = performance.now();
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(performance.now() - t0).toBeLessThan(300);
    expect(got.brief).toEqual(brief);
    expect(got.stale).toBe(false);
    expect(calls(llm)).toHaveLength(1);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffff0000' }).where(eq(t.pullRequests.id, pr.id));
    const stale = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(stale.stale).toBe(true);
    expect(stale.brief.summary).toBe(BRIEF.summary);
    expect(calls(llm)).toHaveLength(1);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-brief' }).returning();
    const foreign = await setupPr(pg.handle.db, other!.id);
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${foreign.id}/brief` })).statusCode).toBe(404);
    await app.close();
  });

  it('headline: invented paths are dropped, the real secret-in-config risk and focus survive (AC-60, AC-19..21)', async () => {
    const llm = mock();
    const app = await appWith(llm);
    const clone = tmp;
    const pr = await setupPr(pg.handle.db, workspaceId, { clonePath: clone });
    await pg.handle.db.insert(t.agents).values({
      workspaceId, name: `brief-agent-${seq}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 's',
      contextDocs: ['specs/plan.md', 'specs/missing.md'],
    });
    const brief = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json().brief;
    expect(brief.risks.risks).toHaveLength(1);
    expect(brief.risks.risks[0].file_refs).toEqual(['src/config.ts:11']);
    expect(brief.review_focus).toEqual([
      { file: 'src/config.ts', line: 11, reason: 'the key', source: 'pr_diff', line_corrected: false },
    ]);
    expect(brief.dropped).toEqual({ risks: 1, risk_refs: 2, review_focus: 1 });
    const specs = Object.fromEntries(brief.specs.map((s: { path: string }) => [s.path, s]));
    expect(specs['specs/plan.md']).toMatchObject({ status: 'used', reason: null });
    expect(specs['specs/plan.md'].tokens).toBeGreaterThan(0);
    expect(specs['specs/missing.md']).toMatchObject({ status: 'skipped', reason: 'not_found' });
    const prompt = (calls(llm)[0]!.req as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('Never commit live keys.');
    expect(prompt).not.toContain('sk_live_xxx');
    await app.close();
  });

  it('records each unavailable input in missing_inputs and still generates (AC-13, NFR-4)', async () => {
    const llm = mock();
    const app = await appWith(llm);
    const pr = await setupPr(pg.handle.db, workspaceId, { body: '', files: false, clonePath: null });
    const brief = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json().brief;
    const kinds = brief.missing_inputs.map((m: { input: string }) => m.input);
    expect(kinds).toEqual(expect.arrayContaining(['intent', 'pr_body', 'linked_issue', 'smart_diff']));
    expect(brief.missing_inputs.find((m: { input: string }) => m.input === 'intent').reason).toBe('not derived yet');
    expect(calls(llm)).toHaveLength(1);
    await app.close();
  });

  it('uses the risk_brief workspace override; a later Settings change leaves the brief fresh (AC-8, AC-65)', async () => {
    const llm = mock();
    const app = await appWith(llm);
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'vendor/brief-model' } } },
    });
    expect(put.statusCode).toBe(200);
    const pr = await setupPr(pg.handle.db, workspaceId);
    const brief = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json().brief;
    expect(brief).toMatchObject({ provider: 'openrouter', model: 'vendor/brief-model' });
    expect((calls(llm)[0]!.req as { model: string }).model).toBe('vendor/brief-model');

    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-4.1' } } },
    });
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(got.stale).toBe(false);
    expect(got.brief.model).toBe('vendor/brief-model');
    await app.close();
  });

  it('rate-limits POST at 5/min (AC-38)', async () => {
    const llm = mock();
    const app = await appWith(llm, 'development');
    const pr = await setupPr(pg.handle.db, workspaceId);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode);
    }
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
    await app.close();
  });
});
