import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@ export const config = {
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const INTENT = {
  summary: 'Adds a Stripe key to config.',
  in_scope: ['config'],
  out_of_scope: ['refactors'],
  risk_areas: [{ label: 'secrets', kind: 'security' }],
  missing_context: [],
  confidence: 'high',
};

const REVIEW = {
  verdict: 'request_changes',
  summary: 'x',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `intent-api-${seq++}`;
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
      title: 'Add config',
      author: 'a',
      branch: 'feat',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Adds config. See specs/plan.md',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('intent layer (Testcontainers pg)', () => {
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

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({ files: { 'specs/plan.md': 'the plan' } }),
        llm: { openai: llm, openrouter: llm },
      },
    });
  }

  it('GET null → POST → GET record (snake_case) → stale after head moves; foreign workspace 404s', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: INTENT } });
    const app = await appWith(llm);
    const pr = await setupPr(pg.handle.db, workspaceId);

    const empty = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(empty).toEqual({ intent: null, stale: false });

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(post.statusCode).toBe(200);
    const rec = post.json().intent;
    expect(rec.summary).toBe(INTENT.summary);
    expect(rec.head_sha).toBe('a1b2c3d4');
    expect(rec.sources.some((s: { kind: string; status: string }) => s.kind === 'repo_doc' && s.status === 'used')).toBe(true);
    expect(rec).toHaveProperty('diff_tokens_saved');
    expect(rec).toHaveProperty('computed_at');

    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.stale).toBe(false);
    expect(got.intent.pr_id).toBe(pr.id);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffff0000' }).where(eq(t.pullRequests.id, pr.id));
    const stale = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(stale.stale).toBe(true);

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await setupPr(pg.handle.db, other!.id);
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${foreign.id}/intent` })).statusCode).toBe(404);

    await app.close();
  });

  it('review run makes two LLM calls (PrIntent then Review) and traces the intent block', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: INTENT, Review: REVIEW } });
    const app = await appWith(llm);
    const pr = await setupPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const names = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => (c.req as { schemaName: string }).schemaName);
    expect(names.slice(0, 2)).toEqual(['PrIntent', 'Review']);

    const trace = (await waitForRunTrace(app, res.json().runs[0].run_id)) as {
      prompt_assembly: { intent: string | null };
      log: { msg: string }[];
    };
    expect(trace.prompt_assembly.intent).toBeTruthy();
    expect(trace.log.some((l) => l.msg.startsWith('Deriving PR intent'))).toBe(true);
    await app.close();
  });

  it('a failing classifier does not fail the run', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: { bad: true }, Review: REVIEW } });
    const app = await appWith(llm);
    const pr = await setupPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec2', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    await app.close();
  });
});
