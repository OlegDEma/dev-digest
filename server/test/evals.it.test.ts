import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { GitClient, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockGitHubClient } from '../src/adapters/mocks.js';
import { MAX_EVAL_CASES_PER_AGENT } from '../src/modules/evals/constants.js';
import { EvalService } from '../src/modules/evals/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals] Docker / TEST_DATABASE_URL not available — skipping integration tests.');
}

const SNAPSHOT = {
  agent_version: 1,
  config_id: 'c',
  provider: 'openai',
  model: 'm',
  system_prompt: 'p',
  strategy: 'single-pass',
  skills: [],
};
// The external TEST_DATABASE_URL is not wiped between runs: keep repo names unique.
const TAG = randomUUID().slice(0, 8);
const PATCH = '@@ -1,1 +1,2 @@\n a\n+b';

/** Git mock whose diff always throws → forces the `pr_files` fallback (and counts calls). */
class ThrowingGit {
  calls = 0;
  async diff() {
    this.calls++;
    throw new Error('no clone');
  }
}

/**
 * Prompt-sensitive LLM stub. Default: one finding at line 2 of the case's file
 * (grounded by the diff). `behave` can throw, return nothing, or react to the
 * prompt; `gate` holds every call open until released.
 */
class StubLLM extends MockLLMProvider {
  prompts: unknown[] = [];
  inFlight = 0;
  maxInFlight = 0;
  gate: Promise<void> | null = null;
  /** Per-call delay (ms) before answering, to force a chosen finish order. */
  delayFor: (promptText: string) => number = () => 0;
  behave: (promptText: string) => 'default' | 'none' | 'forbidden' | Error = () => 'default';

  reset() {
    this.calls = [];
    this.prompts = [];
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.gate = null;
    this.delayFor = () => 0;
    this.behave = () => 'default';
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    this.prompts.push(req.messages);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.gate) await this.gate;
      const text = JSON.stringify(req.messages);
      const wait = this.delayFor(text);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const verdict = this.behave(text);
      if (verdict instanceof Error) throw verdict;
      const file = /diff --git a\/([^\s\\]+)/.exec(text)?.[1] ?? 'x.ts';
      const review: Review = {
        verdict: 'comment',
        summary: 's',
        score: 80,
        findings:
          verdict === 'none'
            ? []
            : [
                {
                  id: 'f1',
                  severity: 'WARNING',
                  category: 'bug',
                  title: 'stub finding',
                  file,
                  start_line: 2,
                  end_line: 2,
                  rationale: 'r',
                  confidence: 0.9,
                  kind: 'finding',
                },
                // hallucinated: outside the diff → dropped by grounding
                {
                  id: 'f2',
                  severity: 'WARNING',
                  category: 'bug',
                  title: 'phantom',
                  file,
                  start_line: 999,
                  end_line: 999,
                  rationale: 'r',
                  confidence: 0.1,
                  kind: 'finding',
                },
              ],
      };
      return {
        data: review as unknown as T,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.002,
        raw: '{}',
        attempts: 1,
      };
    } finally {
      this.inFlight--;
    }
  }
}

d('evals (pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  const llm = new StubLLM('openai');
  const git = new ThrowingGit();
  const github = new MockGitHubClient();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: git as unknown as GitClient, github, llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });
  beforeEach(() => {
    llm.reset();
    git.calls = 0;
  });

  const db = () => pg.handle.db;
  let seq = 0;

  async function createAgent(over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Eval Agent ${seq++}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'You are a reviewer. MARKER-A',
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  /** repo + PR + pr_file + review + finding, all in one go. */
  async function seedFinding(opts: {
    agentId: string | null;
    decision?: 'accepted' | 'dismissed' | null;
    file?: string;
    patch?: string | null;
    workspace?: string;
    title?: string;
  }) {
    const ws = opts.workspace ?? workspaceId;
    const n = seq++;
    const file = opts.file ?? `src/f${n}.ts`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `r${TAG}-${n}`, fullName: `acme/r${TAG}-${n}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 100 + n,
        title: 'PR',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    if (opts.patch !== null) {
      await db()
        .insert(t.prFiles)
        .values([
          { prId: pr!.id, path: 'other.ts', patch: '@@ -1 +1 @@\n-x\n+y' },
          { prId: pr!.id, path: file, patch: opts.patch ?? PATCH },
        ]);
    }
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: opts.agentId, kind: 'review' })
      .returning();
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file,
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: opts.title ?? `Finding ${n}`,
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: opts.decision === 'accepted' ? new Date() : null,
        dismissedAt: opts.decision === 'dismissed' ? new Date() : null,
      })
      .returning();
    return { finding: finding!, pr: pr!, review: review!, file, repo: repo! };
  }

  async function addCase(agentId: string, decision: 'accepted' | 'dismissed' = 'accepted', title?: string) {
    const s = await seedFinding({ agentId, decision, ...(title ? { title } : {}) });
    const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    return { ...s, case: res.json().case as { id: string; name: string } };
  }

  async function waitRun(id: string) {
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${id}` });
      const body = res.json();
      if (body.status !== 'running') return body;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('run did not finish');
  }

  const startRun = (agentId: string) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });

  // ---------------------------------------------------------------- V10
  describe('case creation', () => {
    it('accepted -> must_find with that file only; display + source copied; 0 LLM calls; version unchanged (AC-1, 3a, 5, 6a, 6b)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'accepted', title: 'SQL Injection!' });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(201);
      const { case: c, created } = res.json();
      expect(created).toBe(true);
      expect(c.expectation).toEqual({ kind: 'must_find', file: s.file, start_line: 2, end_line: 2 });
      expect(c.name).toBe('sql-injection');
      expect(c.input_diff).toContain(`diff --git a/${s.file} b/${s.file}`);
      expect(c.input_diff).not.toContain('other.ts');
      expect(c.display).toEqual({ title: 'SQL Injection!', severity: 'CRITICAL', category: 'security' });
      expect(c.source).toEqual({ finding_id: s.finding.id, pr_number: s.pr.number, repo: s.repo.fullName });
      expect(c.owner_id).toBe(agent.id);
      expect(c.last_result).toBeNull();
      expect(llm.calls).toHaveLength(0);

      const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
      expect(del.statusCode).toBe(204);
      const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
      expect(after.version).toBe(agent.version);
    });

    it('dismissed -> must_not_flag (AC-2)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'dismissed' });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(201);
      expect(res.json().case.expectation.kind).toBe('must_not_flag');
    });

    it('same finding again -> 200 created:false, one row (AC-7a)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'accepted' });
      const a = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      const b = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(200);
      expect(b.json().created).toBe(false);
      expect(b.json().case.id).toBe(a.json().case.id);
      const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, s.finding.id));
      expect(rows).toHaveLength(1);
    });

    it('name clash gets -2 (AC-4b)', async () => {
      const agent = await createAgent();
      const a = await addCase(agent.id, 'accepted', 'Same Title');
      const b = await addCase(agent.id, 'accepted', 'Same Title');
      expect([a.case.name, b.case.name]).toEqual(['same-title', 'same-title-2']);
    });

    it('two simultaneous creations with the same title both succeed: x and x-2, no 500 (AC-4b)', async () => {
      const agent = await createAgent();
      const [a, b] = await Promise.all([
        seedFinding({ agentId: agent.id, decision: 'accepted', title: 'Racy Title' }),
        seedFinding({ agentId: agent.id, decision: 'accepted', title: 'Racy Title' }),
      ]);
      const [ra, rb] = await Promise.all([
        app.inject({ method: 'POST', url: `/findings/${a.finding.id}/eval-case` }),
        app.inject({ method: 'POST', url: `/findings/${b.finding.id}/eval-case` }),
      ]);
      expect([ra.statusCode, rb.statusCode]).toEqual([201, 201]);
      expect([ra.json().case.name, rb.json().case.name].sort()).toEqual(['racy-title', 'racy-title-2']);
    });

    it(`an agent at ${MAX_EVAL_CASES_PER_AGENT} cases -> 422 eval_case_limit; the duplicate path still returns 200`, async () => {
      const agent = await createAgent();
      const first = await addCase(agent.id);
      await db()
        .insert(t.evalCases)
        .values(
          Array.from({ length: MAX_EVAL_CASES_PER_AGENT - 1 }, (_, i) => ({
            workspaceId,
            ownerKind: 'agent' as const,
            ownerId: agent.id,
            agentId: agent.id,
            name: `bulk-${i}`,
          })),
        );
      const dup = await app.inject({ method: 'POST', url: `/findings/${first.finding.id}/eval-case` });
      expect(dup.statusCode).toBe(200);
      const extra = await seedFinding({ agentId: agent.id, decision: 'accepted' });
      const res = await app.inject({ method: 'POST', url: `/findings/${extra.finding.id}/eval-case` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('eval_case_limit');
      expect(res.json().error.message).toContain(String(MAX_EVAL_CASES_PER_AGENT));
      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, extra.finding.id))).toHaveLength(0);
    });

    it('case is immutable after the finding is deleted: source.finding_id -> null (AC-3b)', async () => {
      const agent = await createAgent();
      const s = await addCase(agent.id);
      await db().delete(t.findings).where(eq(t.findings.id, s.finding.id));
      await db().delete(t.pullRequests).where(eq(t.pullRequests.id, s.pr.id));
      const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list).toHaveLength(1);
      expect(list[0].source.finding_id).toBeNull();
      expect(list[0].input_diff).toContain(s.file);
    });

    it('no stored patch and git throws -> 422 diff_unavailable naming the file, nothing created (AC-8a)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'accepted', patch: null });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('diff_unavailable');
      expect(res.json().error.message).toContain(s.file);
      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, s.finding.id))).toHaveLength(0);
    });

    it('review without an agent -> 422 finding_without_agent (AC-9)', async () => {
      const s = await seedFinding({ agentId: null, decision: 'accepted' });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('finding_without_agent');
    });

    it('undecided -> 422 finding_undecided', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: null });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('finding_undecided');
    });

    it('missing or foreign-workspace finding -> 404 finding_not_found (AC-10)', async () => {
      const agent = await createAgent();
      const [other] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
      const s = await seedFinding({ agentId: agent.id, decision: 'accepted', workspace: other!.id });
      const foreign = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json().error.code).toBe('finding_not_found');
      const missing = await app.inject({
        method: 'POST',
        url: '/findings/00000000-0000-4000-8000-000000000000/eval-case',
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('finding_not_found');
    });
  });

  // ---------------------------------------------------------------- V12 / V13
  describe('run', () => {
    it('POST returns 202 running before any LLM call completes; engine input is only diff + prompt + skills; snapshot is stable (AC-22b, 24-28, 26)', async () => {
      const agent = await createAgent();
      const mk = async (name: string, body: string) =>
        (await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'custom', body } })).json().id as string;
      const s1 = await mk('Skill One', '  body one  ');
      const s2 = await mk('Skill Two', 'body two');
      const link = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [s1, s2] } });
      expect(link.statusCode).toBeLessThan(300);
      const c1 = await addCase(agent.id);
      await addCase(agent.id, 'dismissed');

      git.calls = 0;
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const t0 = Date.now();
      const res = await startRun(agent.id);
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(res.statusCode).toBe(202);
      const run = res.json();
      expect(run.status).toBe('running');
      expect(run.progress).toEqual({ done: 0, total: 2 });
      expect(run.config.skills.map((s: { name: string }) => s.name)).toEqual(['Skill One', 'Skill Two']);

      // edit prompt + skills mid-run: the run keeps its snapshot
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'CHANGED MARKER-B' } });
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [s2] } });
      release();
      const done = await waitRun(run.id);

      expect(done.status).toBe('done');
      expect(done.config.system_prompt).toContain('MARKER-A');
      expect(done.config.agent_version).toBe(agent.version);
      expect(llm.calls).toHaveLength(2);
      const expected = assemblePrompt({
        system: 'You are a reviewer. MARKER-A',
        skills: ['### Skill One\nbody one', '### Skill Two\nbody two'],
        diff: c1.case ? (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json().find((c: { id: string }) => c.id === c1.case.id).input_diff : '',
      }).messages;
      expect(llm.prompts).toContainEqual(expected);
      expect(JSON.stringify(llm.prompts)).not.toContain('MARKER-B');
      expect(git.calls).toBe(0);
      expect(github.posted).toHaveLength(0);
      expect(done.progress).toEqual({ done: 2, total: 2 });
      expect(done.results).toHaveLength(2);
      // grounded finding kept, phantom dropped
      expect(done.results[0].grounded).toBe(1);
      expect(done.results[0].dropped).toBe(1);
    });

    it('runs at most 4 reviews in flight (NFR-3)', async () => {
      const agent = await createAgent();
      for (let i = 0; i < 6; i++) await addCase(agent.id);
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const run = (await startRun(agent.id)).json();
      for (let i = 0; i < 100 && llm.maxInFlight < 4; i++) await new Promise((r) => setTimeout(r, 10));
      expect(llm.maxInFlight).toBe(4);
      release();
      const done = await waitRun(run.id);
      expect(llm.maxInFlight).toBe(4);
      expect(done.counts.cases_total).toBe(6);
    });

    it('second POST while running -> 409 with details.run_id (AC-30a)', async () => {
      const agent = await createAgent();
      await addCase(agent.id);
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const first = (await startRun(agent.id)).json();
      const second = await startRun(agent.id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('eval_run_in_progress');
      expect(second.json().error.details.run_id).toBe(first.id);
      release();
      await waitRun(first.id);
      expect((await startRun(agent.id)).statusCode).toBe(202);
    });

    it('0 cases -> 422 no_eval_cases (AC-31a)', async () => {
      const agent = await createAgent();
      const res = await startRun(agent.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('no_eval_cases');
    });

    it('no provider key -> 422 provider_not_configured naming the provider, no run row (AC-32a)', async () => {
      const bare = await buildApp({
        config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        db: pg.handle.db,
        overrides: {
          git: git as unknown as GitClient,
          github,
          secrets: { get: async () => undefined },
        },
      });
      const agent = await createAgent();
      await addCase(agent.id);
      const res = await bare.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('provider_not_configured');
      expect(res.json().error.message).toContain('openai');
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
      await bare.close();
    });

    it('disabled agent is runnable (AC-37)', async () => {
      const agent = await createAgent();
      await addCase(agent.id);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { enabled: false } });
      const res = await startRun(agent.id);
      expect(res.statusCode).toBe(202);
      await waitRun(res.json().id);
    });

    it('unknown / foreign agent -> 404', async () => {
      const res = await startRun('00000000-0000-4000-8000-000000000000');
      expect(res.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------- V11
  describe('cases + history', () => {
    it('list is newest first with last_result; delete keeps old results by name; history <= 50 (AC-16a, 18a, 18b, 46a)', async () => {
      const agent = await createAgent();
      const a = await addCase(agent.id, 'accepted', 'First');
      const b = await addCase(agent.id, 'dismissed', 'Second');
      let list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list.map((c: { name: string }) => c.name)).toEqual(['second', 'first']);
      expect(list[0].last_result).toBeNull();

      const run = (await startRun(agent.id)).json();
      await waitRun(run.id);
      list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list[1].last_result).toMatchObject({ run_id: run.id, status: 'pass', summary: 'expected 1 finding, got 1' });
      expect(list[0].last_result).toMatchObject({ run_id: run.id, status: 'fail', summary: expect.stringContaining('must not flag') });

      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${a.case.id}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${a.case.id}` })).statusCode).toBe(404);
      list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list.map((c: { id: string }) => c.id)).toEqual([b.case.id]);
      const detail = (await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json();
      expect(detail.results.map((r: { case_name: string }) => r.case_name)).toEqual(['first', 'second']);
      expect(detail.results[0].case_id).toBeNull();
      expect(detail.case_ids).toContain(a.case.id);

      for (let i = 0; i < 52; i++) {
        await db().insert(t.evalRuns).values({
          workspaceId, agentId: agent.id, agentName: 'x', status: 'done', progressTotal: 1,
          config: detail.config, caseIds: [], startedAt: new Date(Date.now() - (i + 1) * 60_000),
        });
      }
      const hist = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
      expect(hist).toHaveLength(50);
      expect(hist[0].id).toBe(run.id);
      expect(hist[1].cost_usd).toBeNull();
    });

    it('deleting a case during a run: the run still finishes its captured set (AC-19)', async () => {
      const agent = await createAgent();
      const a = await addCase(agent.id);
      await addCase(agent.id);
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const run = (await startRun(agent.id)).json();
      await app.inject({ method: 'DELETE', url: `/eval-cases/${a.case.id}` });
      release();
      const done = await waitRun(run.id);
      expect(done.status).toBe('done');
      expect(done.results).toHaveLength(2);
      expect(llm.calls).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------- V14
  describe('errors', () => {
    it('one throwing case -> that result is error, others scored, run partial; cost null (AC-33a, 33b, D12)', async () => {
      const agent = await createAgent();
      for (let i = 0; i < 3; i++) await addCase(agent.id);
      const cases = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      const bad = cases[1].input_diff.match(/diff --git a\/(\S+)/)![1] as string;
      llm.behave = (text) => (text.includes(bad) ? new Error('provider timeout') : 'default');
      const run = (await startRun(agent.id)).json();
      const done = await waitRun(run.id);
      expect(done.status).toBe('partial');
      const errs = done.results.filter((r: { status: string }) => r.status === 'error');
      expect(errs).toHaveLength(1);
      expect(errs[0].error).toBe('provider timeout');
      expect(done.counts).toMatchObject({ cases_total: 3, cases_scored: 2, cases_error: 1 });
      expect(done.metrics.recall).toBe(1);
      expect(done.cost_usd).toBeNull();
    });

    it('every case throws -> failed, metrics null, error = lowest-position case message even if a later case fails first (AC-34)', async () => {
      const agent = await createAgent();
      for (let i = 0; i < 3; i++) await addCase(agent.id);
      // the list is newest first; run positions are oldest first
      const cases = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      const files = [...cases]
        .reverse()
        .map((c: { input_diff: string }) => c.input_diff.match(/diff --git a\/(\S+)/)![1] as string);
      // position 0 finishes last, position 2 first
      llm.delayFor = (text) => (text.includes(files[0]!) ? 150 : text.includes(files[1]!) ? 75 : 0);
      llm.behave = (text) => {
        const i = files.findIndex((f) => text.includes(f));
        return new Error(`failure at position ${i}`);
      };
      const done = await waitRun((await startRun(agent.id)).json().id);
      expect(done.status).toBe('failed');
      expect(done.metrics).toBeNull();
      expect(done.error).toBe('failure at position 0');
      expect(done.counts.cases_error).toBe(3);
    });

    it('logs: one start, one finish, one per errored case; no diff or prompt text (NFR-6, NFR-7)', async () => {
      const agent = await createAgent();
      await addCase(agent.id);
      await addCase(agent.id);
      const lines: { obj: unknown; msg?: string }[] = [];
      const log = {
        info: (obj: unknown, msg?: string) => lines.push({ obj, ...(msg ? { msg } : {}) }),
        warn: (obj: unknown, msg?: string) => lines.push({ obj, ...(msg ? { msg } : {}) }),
      };
      llm.behave = () => new Error('boom');
      const svc = new EvalService(app.container, log);
      const run = await svc.startRun({ workspaceId, userId: 'u' }, agent.id);
      await waitRun(run.id);
      const msgs = lines.map((l) => l.msg);
      expect(msgs.filter((m) => m === 'eval run started')).toHaveLength(1);
      expect(msgs.filter((m) => m === 'eval run finished')).toHaveLength(1);
      expect(msgs.filter((m) => m === 'eval case errored')).toHaveLength(2);
      const dump = JSON.stringify(lines);
      expect(dump).not.toContain('MARKER-A');
      expect(dump).not.toContain('diff --git');
    });
  });

  // ---------------------------------------------------------------- V15
  it('reaper: a running row becomes failed with "server restarted during run" (AC-35)', async () => {
    const agent = await createAgent();
    await addCase(agent.id);
    const [row] = await db()
      .insert(t.evalRuns)
      .values({
        workspaceId, agentId: agent.id, agentName: 'x', status: 'running', progressTotal: 1,
        config: SNAPSHOT, caseIds: [],
      })
      .returning();
    const n = await new EvalService(app.container).reapStaleRuns();
    expect(n).toBeGreaterThanOrEqual(1);
    const res = (await app.inject({ method: 'GET', url: `/eval-runs/${row!.id}` })).json();
    expect(res.status).toBe('failed');
    expect(res.error).toBe('server restarted during run');
    expect(res.finished_at).not.toBeNull();
  });

  // ---------------------------------------------------------------- V16
  it('eval runs leave PR runs, reviews, findings and skill stats untouched (AC-36a, 36b)', async () => {
    const agent = await createAgent();
    const c = await addCase(agent.id);
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: { name: 'Iso', type: 'custom', body: 'b' } })).json().id;
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skillId] } });
    const snapshot = async () => ({
      runs: (await app.inject({ method: 'GET', url: `/pulls/${c.pr.id}/runs` })).json(),
      active: (await app.inject({ method: 'GET', url: `/pulls/${c.pr.id}/runs/active` })).json(),
      reviews: (await app.inject({ method: 'GET', url: `/pulls/${c.pr.id}/reviews` })).json(),
      stats: (await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })).json(),
      agentRuns: (await db().select().from(t.agentRuns)).length,
      reviewRows: (await db().select().from(t.reviews)).length,
      findingRows: (await db().select().from(t.findings)).length,
    });
    const before = await snapshot();
    await waitRun((await startRun(agent.id)).json().id);
    expect(await snapshot()).toEqual(before);
  });

  // ---------------------------------------------------------------- V17 / V18
  describe('dashboard + versions', () => {
    it('one card per agent with last finished run; 20 recent runs newest first; 0 LLM calls (AC-56a, 57, 60)', async () => {
      const agent = await createAgent();
      await addCase(agent.id);
      const run = (await startRun(agent.id)).json();
      await waitRun(run.id);
      const idle = await createAgent();
      const callsBefore = llm.calls.length;
      const res = await app.inject({ method: 'GET', url: '/eval-dashboard' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(llm.calls.length).toBe(callsBefore);
      const card = body.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
      expect(card).toMatchObject({ cases_total: 1, model: 'gpt-4o-mini', enabled: true });
      expect(card.last_run.id).toBe(run.id);
      const idleCard = body.agents.find((a: { agent_id: string }) => a.agent_id === idle.id);
      expect(idleCard).toMatchObject({ cases_total: 0, last_run: null });
      expect(body.agents).toHaveLength((await app.inject({ method: 'GET', url: '/agents' })).json().length);

      for (let i = 0; i < 25; i++) {
        await db().insert(t.evalRuns).values({
          workspaceId, agentId: idle.id, agentName: 'x', status: 'done', progressTotal: 1,
          config: card.last_run.config, caseIds: [], startedAt: new Date(Date.now() + (i + 1) * 1000),
        });
      }
      const again = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
      expect(again.recent_runs).toHaveLength(20);
      const times = again.recent_runs.map((r: { started_at: string }) => r.started_at);
      expect([...times].sort().reverse()).toEqual(times);
    });

    it('prompt change: run B has version+1 and different metrics, LLM calls = cases per run (AC-63)', async () => {
      const agent = await createAgent();
      await addCase(agent.id, 'accepted');
      await addCase(agent.id, 'dismissed');
      llm.behave = (text) => (text.includes('MARKER-B') ? 'default' : 'none');
      const a = await waitRun((await startRun(agent.id)).json().id);
      expect(llm.calls).toHaveLength(2);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'Be noisy. MARKER-B' } });
      const b = await waitRun((await startRun(agent.id)).json().id);
      expect(llm.calls).toHaveLength(4);
      expect(b.config.agent_version).toBe(a.config.agent_version + 1);
      expect(b.config.config_id).not.toBe(a.config.config_id);
      expect(a.metrics.recall).toBe(0);
      expect(b.metrics.recall).toBe(1);
      expect(b.metrics.precision).toBe(0.5);
      expect(a.metrics.precision).toBeNull();
    });
  });

  // ---------------------------------------------------------------- V19
  it('deleting the agent removes its cases, runs and results (NFR-8, EC-20)', async () => {
    const agent = await createAgent();
    await addCase(agent.id);
    const run = (await startRun(agent.id)).json();
    await waitRun(run.id);
    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
    expect(del.statusCode).toBeLessThan(300);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    expect(await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
  });
});
