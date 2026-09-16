import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import {
  createAgentRun,
  completeAgentRun,
  listRunsForPull,
} from '../src/modules/reviews/repository/run.repo.js';
import * as t from '../src/db/schema.js';

/**
 * Run Cost Badge — DB-backed coverage for the two server layers the feature
 * touches (the pure formatter + component rendering live in the client suite):
 *   1. run.repo — `completeAgentRun` persists `agent_runs.cost_usd` and
 *      `listRunsForPull` returns it on the RunSummary; failed/omitted → null.
 *   2. pulls list route — a PR's `cost_usd` is the SUM over agents of each
 *      agent's most-recent run cost (not one agent, not older runs of the same).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `cost-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1, // non-zero so the list route never triggers a detail backfill
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function makeAgent(db: PgFixture['handle']['db'], workspaceId: string, name: string) {
  const [a] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      systemPrompt: 's',
    })
    .returning();
  return a!;
}

d('Run Cost Badge — cost persistence + list aggregation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // ---- run.repo: persist + read cost ---------------------------------------

  it('completeAgentRun persists cost_usd; listRunsForPull returns it on the RunSummary', async () => {
    const { pr } = await setupPr(db, workspaceId);
    const runId = await createAgentRun(db, {
      workspaceId,
      agentId: null,
      prId: pr.id,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    await completeAgentRun(db, runId, {
      status: 'done',
      durationMs: 1200,
      tokensIn: 1432,
      tokensOut: 309,
      costUsd: 0.000287,
      findingsCount: 0,
      grounding: '0/0 passed',
      score: 100,
      blockers: 0,
      error: null,
    });

    // raw column
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.costUsd).toBeCloseTo(0.000287, 6);
    // transport shape (RunSummary — powers the PR-detail timeline)
    const runs = await listRunsForPull(db, workspaceId, pr.id);
    const summary = runs.find((r) => r.run_id === runId)!;
    expect(summary.cost_usd).toBeCloseTo(0.000287, 6);
  });

  it('a failed run leaves cost_usd null — no fabricated price', async () => {
    const { pr } = await setupPr(db, workspaceId);
    const runId = await createAgentRun(db, {
      workspaceId,
      agentId: null,
      prId: pr.id,
      provider: 'openrouter',
      model: 'm',
    });
    await completeAgentRun(db, runId, {
      status: 'failed',
      durationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      findingsCount: 0,
      grounding: '0/0 passed',
      error: 'boom',
    });
    const runs = await listRunsForPull(db, workspaceId, pr.id);
    expect(runs.find((r) => r.run_id === runId)!.cost_usd).toBeNull();
  });

  it('completeAgentRun defaults cost_usd to null when omitted', async () => {
    const { pr } = await setupPr(db, workspaceId);
    const runId = await createAgentRun(db, {
      workspaceId,
      agentId: null,
      prId: pr.id,
      provider: 'openrouter',
      model: 'm',
    });
    await completeAgentRun(db, runId, {
      status: 'done',
      durationMs: 5,
      tokensIn: 10,
      tokensOut: 5,
      findingsCount: 0,
      grounding: '0/0 passed',
    });
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.costUsd).toBeNull();
  });

  // ---- pulls list: cost = SUM over agents of each agent's latest run --------

  it('PR-list cost_usd sums the latest run per agent (not one agent, not older runs)', async () => {
    const { repo, pr } = await setupPr(db, workspaceId);
    const [a, b, c] = await Promise.all([
      makeAgent(db, workspaceId, 'Security Reviewer'),
      makeAgent(db, workspaceId, 'Performance Reviewer'),
      makeAgent(db, workspaceId, 'General Reviewer'),
    ]);
    const base = new Date('2026-09-15T10:00:00Z');
    const at = (mins: number) => new Date(base.getTime() + mins * 60_000);
    // Agent A: an OLDER expensive run + a NEWER cheap run → only the newer counts.
    await db.insert(t.agentRuns).values([
      { workspaceId, prId: pr.id, agentId: a.id, provider: 'openrouter', model: 'm', status: 'done', costUsd: 0.005, ranAt: at(0) },
      { workspaceId, prId: pr.id, agentId: a.id, provider: 'openrouter', model: 'm', status: 'done', costUsd: 0.000159, ranAt: at(10) },
      { workspaceId, prId: pr.id, agentId: b.id, provider: 'openrouter', model: 'm', status: 'done', costUsd: 0.000337, ranAt: at(10) },
      { workspaceId, prId: pr.id, agentId: c.id, provider: 'openrouter', model: 'm', status: 'done', costUsd: 0.000287, ranAt: at(10) },
    ]);

    // MockGitHubClient({ pulls: [] }) → no GitHub sync, so only our seeded PR is served.
    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const row = (res.json() as Array<{ number: number; cost_usd: number | null }>).find(
      (p) => p.number === 482,
    )!;
    // 0.000159 (A latest) + 0.000337 (B) + 0.000287 (C) = 0.000783; A's older 0.005 excluded.
    expect(row.cost_usd).toBeCloseTo(0.000783, 6);
    await app.close();
  });

  it('PR-list cost_usd is null for a PR with no runs', async () => {
    const { repo } = await setupPr(db, workspaceId);
    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const row = (res.json() as Array<{ number: number; cost_usd: number | null }>).find(
      (p) => p.number === 482,
    )!;
    expect(row.cost_usd).toBeNull();
    await app.close();
  });
});
