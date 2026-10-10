import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ActiveRun, RunDetail } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * GET /runs/:id (RunDetail) and the response schema on GET /pulls/:id/runs/active.
 * Rows are inserted directly — no LLM.
 */

const tag = Date.now().toString(36);
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /runs/:id + active-runs serializer (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let prId: string;
  let agentId: string;

  async function insertRun(status: string, extra: Partial<typeof t.agentRuns.$inferInsert> = {}) {
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId, prId, provider: 'openrouter', model: 'm', status, ...extra })
      .returning();
    return run!;
  }

  async function insertReview(runId: string, verdict: string | null) {
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, runId, kind: 'review', verdict, summary: 'sum', score: 80, model: 'm' })
      .returning();
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/a.ts',
      startLine: 3,
      endLine: 5,
      severity: 'WARNING',
      category: 'bug',
      title: 'Null deref',
      rationale: 'because',
      confidence: 0.9,
    });
    return review!;
  }

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `rd-repo-${tag}`, fullName: `acme/rd-repo-${tag}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'T',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'RD Agent', provider: 'openrouter', model: 'm', systemPrompt: 's' })
      .returning();
    agentId = agent!.id;
    app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('(a) running run → review null, pr_id set', async () => {
    const run = await insertRun('running');
    const res = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    expect(res.statusCode).toBe(200);
    const body = RunDetail.parse(res.json());
    expect(body.review).toBeNull();
    expect(body.pr_id).toBe(prId);
    expect(body.status).toBe('running');
    expect(body.agent_name).toBe('RD Agent');
  });

  it('(b) done run → review with contract casing', async () => {
    const run = await insertRun('done');
    await insertReview(run.id, 'request_changes');
    const res = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    expect(res.statusCode).toBe(200);
    const body = RunDetail.parse(res.json());
    expect(body.review!.verdict).toBe('request_changes');
    expect(body.review!.findings[0]).toMatchObject({
      severity: 'WARNING',
      category: 'bug',
      start_line: 3,
      end_line: 5,
    });
  });

  it('(c) unknown run id → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs/00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
  });

  it('(d) non-uuid id → 422', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs/abc' });
    expect(res.statusCode).toBe(422);
  });

  it('(e) run of another workspace → 404', async () => {
    const [ws2] = await db.insert(t.workspaces).values({ name: `other-${tag}` } as never).returning();
    const [other] = await db
      .insert(t.agentRuns)
      .values({ workspaceId: ws2!.id, provider: 'openrouter', model: 'm', status: 'done' })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/runs/${other!.id}` });
    expect(res.statusCode).toBe(404);
  });

  it('(f) legacy bogus verdict → review.verdict null, still 200', async () => {
    const run = await insertRun('done');
    await insertReview(run.id, 'APPROVE');
    const res = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    expect(res.statusCode).toBe(200);
    expect(RunDetail.parse(res.json()).review!.verdict).toBeNull();
  });

  it('(g) GET /pulls/:id/runs/active → only the running run, exact ActiveRun keys', async () => {
    const [repo2] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `rd-repo2-${tag}`, fullName: `acme/rd-repo2-${tag}` })
      .returning();
    const [pr2] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo2!.id,
        number: 8,
        title: 'T2',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'abd',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const running = await insertRun('running', { prId: pr2!.id });
    await insertRun('done', { prId: pr2!.id });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr2!.id}/runs/active` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(Object.keys(body[0]!).sort()).toEqual(['agent_id', 'agent_name', 'ran_at', 'run_id']);
    expect(body[0]!.run_id).toBe(running.id);
    expect(ActiveRun.array().parse(body)).toHaveLength(1);
  });
});
