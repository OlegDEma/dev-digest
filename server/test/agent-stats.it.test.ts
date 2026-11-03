import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { AgentStats } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
// The scratch DB is not wiped between runs: keep names unique per run.
const RUN = Math.random().toString(36).slice(2, 8);
const ago = (days: number) => new Date(Date.now() - days * DAY);

/**
 * GET /agents/stats and /agents/:id/stats — 30-day window over `agent_runs`
 * (status='done', every source), findings accepted / dismissed / pending by
 * severity. Eval tables never count.
 */
d('agent stats', () => {
  let pg: PgFixture;
  let wsId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    wsId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name: `stats-${RUN}`, fullName: `o/stats-${RUN}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function newAgent(label: string, workspaceId = wsId) {
    const name = `${label} ${RUN}`;
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'x' })
      .returning();
    return a!;
  }

  async function newRun(
    agentId: string,
    o: {
      days?: number;
      status?: string;
      source?: 'local' | 'ci';
      cost?: number | null;
      ms?: number | null;
      findings?: { severity: string; accepted?: boolean; dismissed?: boolean }[];
    } = {},
  ) {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId: wsId,
        agentId,
        prId,
        ranAt: ago(o.days ?? 1),
        status: o.status ?? 'done',
        source: o.source ?? 'local',
        costUsd: o.cost === undefined ? null : o.cost,
        durationMs: o.ms === undefined ? null : o.ms,
      })
      .returning();
    if (o.findings) {
      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId: wsId, prId, agentId, runId: run!.id, kind: 'review' })
        .returning();
      for (const f of o.findings) {
        await pg.handle.db.insert(t.findings).values({
          reviewId: review!.id,
          file: 'a.ts',
          startLine: 1,
          endLine: 1,
          severity: f.severity,
          category: 'bug',
          title: 'x',
          rationale: 'x',
          confidence: 0.9,
          acceptedAt: f.accepted ? new Date() : null,
          dismissedAt: f.dismissed ? new Date() : null,
        });
      }
    }
    return run!;
  }

  async function statsFor(id: string) {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${id}/stats` });
    await app.close();
    return res;
  }

  it('aggregates done runs, costs, latency and findings by state and severity', async () => {
    const a = await newAgent('Aggregator');
    await newRun(a.id, {
      cost: 0.02,
      ms: 1000,
      findings: [
        { severity: 'CRITICAL', accepted: true },
        { severity: 'WARNING', dismissed: true },
      ],
    });
    await newRun(a.id, { cost: 0.04, ms: 3000, findings: [{ severity: 'SUGGESTION' }, { severity: 'WARNING', accepted: true }] });
    await newRun(a.id, { cost: null, ms: null });

    const res = await statsFor(a.id);
    expect(res.statusCode).toBe(200);
    const s = AgentStats.parse(res.json());
    expect(s).toMatchObject({
      agent_id: a.id,
      agent_name: `Aggregator ${RUN}`,
      runs: 3,
      findings_total: 4,
      accepted: 2,
      dismissed: 1,
      pending: 1,
      accept_rate: 2 / 3,
      dismiss_rate: 1 / 3,
      findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 1 },
      trend: [],
    });
    expect(s.total_cost_usd).toBeCloseTo(0.06);
    expect(s.avg_cost_usd).toBeCloseTo(0.03);
    expect(s.avg_latency_ms).toBeCloseTo(2000);
    expect(s.avg_findings_per_run).toBeCloseTo(4 / 3);
  });

  it('window edge: a run 29 days old counts, one 31 days old does not', async () => {
    const a = await newAgent('Window');
    await newRun(a.id, { days: 29 });
    await newRun(a.id, { days: 31, findings: [{ severity: 'CRITICAL' }] });
    const s = AgentStats.parse((await statsFor(a.id)).json());
    expect(s.runs).toBe(1);
    expect(s.findings_total).toBe(0);
  });

  it('counts done runs only, and both local and ci sources', async () => {
    const a = await newAgent('Sources');
    await newRun(a.id, { source: 'local' });
    await newRun(a.id, { source: 'ci' });
    await newRun(a.id, { status: 'failed' });
    await newRun(a.id, { status: 'running', findings: [{ severity: 'CRITICAL' }] });
    const s = AgentStats.parse((await statsFor(a.id)).json());
    expect(s.runs).toBe(2);
    expect(s.findings_total).toBe(0);
  });

  it('ignores eval runs', async () => {
    const a = await newAgent('EvalOnly');
    // The scratch DB is shared with evals.it: a valid snapshot keeps the eval
    // dashboard serializable, and the row is removed once the assertion is done.
    const [evalRun] = await pg.handle.db
      .insert(t.evalRuns)
      .values({
        workspaceId: wsId,
        agentId: a.id,
        agentName: a.name,
        status: 'done',
        progressTotal: 1,
        config: {
          agent_version: 1,
          config_id: `stats-${RUN}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'x',
          strategy: 'single-pass',
          skills: [],
        },
        caseIds: [],
        costUsd: 1,
        durationMs: 10,
      })
      .returning();
    try {
      const s = AgentStats.parse((await statsFor(a.id)).json());
      expect(s.runs).toBe(0);
      expect(s.total_cost_usd).toBeNull();
    } finally {
      await pg.handle.db.delete(t.evalRuns).where(eq(t.evalRuns.id, evalRun!.id));
    }
  });

  it('zero-run agent: counts 0, ratios and averages null', async () => {
    const a = await newAgent('Idle');
    const s = AgentStats.parse((await statsFor(a.id)).json());
    expect(s).toMatchObject({
      runs: 0,
      findings_total: 0,
      accept_rate: null,
      dismiss_rate: null,
      avg_findings_per_run: null,
      avg_cost_usd: null,
      avg_latency_ms: null,
      total_cost_usd: null,
      findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });
  });

  it('all findings pending: rates are null (pending excluded from the denominator)', async () => {
    const a = await newAgent('AllPending');
    await newRun(a.id, { findings: [{ severity: 'WARNING' }, { severity: 'CRITICAL' }] });
    const s = AgentStats.parse((await statsFor(a.id)).json());
    expect(s).toMatchObject({ findings_total: 2, pending: 2, accept_rate: null, dismiss_rate: null });
  });

  it('runs without findings keep null ratios but a numeric average', async () => {
    const a = await newAgent('NoFindings');
    await newRun(a.id);
    const s = AgentStats.parse((await statsFor(a.id)).json());
    expect(s.runs).toBe(1);
    expect(s.accept_rate).toBeNull();
    expect(s.avg_findings_per_run).toBe(0);
  });

  it('GET /agents/stats returns one row per workspace agent, zero-run included', async () => {
    const app = await makeApp();
    const list = await app.inject({ method: 'GET', url: '/agents' });
    const res = await app.inject({ method: 'GET', url: '/agents/stats' });
    await app.close();
    expect(res.statusCode).toBe(200);
    const rows = (res.json() as unknown[]).map((r) => AgentStats.parse(r));
    const ids = (list.json() as { id: string }[]).map((a) => a.id).sort();
    expect(rows.map((r) => r.agent_id).sort()).toEqual(ids);
    expect(rows.find((r) => r.agent_name === `Idle ${RUN}`)?.runs).toBe(0);
    expect(rows.find((r) => r.agent_name === `Aggregator ${RUN}`)?.runs).toBe(3);
  });

  it('404 for an agent in another workspace, and for an unknown id; foreign agents absent from the list', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `stats-other-${RUN}` }).returning();
    const foreign = await newAgent('Foreign', other!.id);
    expect((await statsFor(foreign.id)).statusCode).toBe(404);
    expect((await statsFor('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/agents/stats' });
    await app.close();
    expect((res.json() as { agent_id: string }[]).some((r) => r.agent_id === foreign.id)).toBe(false);
  });

  it('timing: 20 agents x 1,000 runs (logged, soft)', async () => {
    const { db } = pg.handle;
    const agents = [];
    for (let i = 0; i < 20; i++) agents.push(await newAgent(`Bulk ${i}`));
    for (const a of agents) {
      await db.insert(t.agentRuns).values(
        Array.from({ length: 1000 }, (_, i) => ({
          workspaceId: wsId,
          agentId: a.id,
          prId,
          ranAt: ago(i % 25),
          status: 'done',
          costUsd: 0.01,
          durationMs: 100,
        })),
      );
    }
    const app = await makeApp();
    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url: '/agents/stats' });
    const ms = performance.now() - t0;
    await app.close();
    // eslint-disable-next-line no-console
    console.log(`[agent-stats] 20 agents x 1000 runs: ${ms.toFixed(0)} ms`);
    expect(res.statusCode).toBe(200);
    expect(ms).toBeLessThan(10_000);
  }, 120_000);
});
