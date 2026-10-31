import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
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
import * as caseRepo from '../src/modules/evals/repository/eval-case.repo.js';
import * as runRepo from '../src/modules/evals/repository/eval-run.repo.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { ConfigError } from '../src/platform/errors.js';

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
  /** When set, the stub cites this path instead of the diff's file (a Files-only citation). */
  citeFile: string | null = null;

  reset() {
    this.calls = [];
    this.prompts = [];
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.gate = null;
    this.delayFor = () => 0;
    this.behave = () => 'default';
    this.citeFile = null;
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
      const file = this.citeFile ?? /diff --git a\/([^\s\\]+)/.exec(text)?.[1] ?? 'x.ts';
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
                  // Same severity/category as the seeded findings: eval matching is strict (AC-D42).
                  severity: 'CRITICAL',
                  category: 'security',
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
      if (body.status !== 'running' && body.status !== 'queued') return body;
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
      expect(c.expected).toEqual([
        { kind: 'must_find', file: s.file, start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security' },
      ]);
      expect(c.input_files).toEqual([]);
      expect(c.pr_meta).toEqual({ title: '', description: '' });
      expect(c.revision).toBe(1);
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

    it('a legacy row (expected_output NULL) is presented in the list shape (AC-D24)', async () => {
      const agent = await createAgent();
      await db().insert(t.evalCases).values({
        workspaceId, ownerKind: 'agent', ownerId: agent.id, agentId: agent.id, name: 'legacy-case',
        inputDiff: PATCH, expectationKind: 'must_find', expectationFile: 'src/a.ts',
        expectationStartLine: 3, expectationEndLine: 5, displayTitle: 'Old', displaySeverity: 'WARNING',
        displayCategory: 'bug', sourcePrNumber: 9, sourceRepo: 'acme/old',
      });
      const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        name: 'legacy-case',
        expected: [{ kind: 'must_find', file: 'src/a.ts', start_line: 3, end_line: 5, severity: 'WARNING', category: 'bug' }],
        input_files: [],
        pr_meta: { title: '', description: '' },
        revision: 1,
        source: { finding_id: null, pr_number: 9, repo: 'acme/old' },
      });
    });

    it('dismissed -> must_not_flag (AC-2)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'dismissed' });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(201);
      expect(res.json().case.expected).toEqual([
        expect.objectContaining({ kind: 'must_not_flag' }),
      ]);
      expect(res.json().case.expected[0].severity).toBeUndefined();
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
      expect(list[0].last_result).toMatchObject({ run_id: run.id, status: 'fail', summary: 'expected 0 findings, got 1 · 1 forbidden hit' });

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
      // the provider's message text is not logged, only the error class (it is stored on the result row)
      expect(dump).not.toContain('boom');
      const errored = lines.find((l) => l.msg === 'eval case errored')!;
      expect(errored.obj).toMatchObject({ errorName: 'Error' });
      expect(Object.keys(errored.obj as object).sort()).toEqual(['caseId', 'errorName', 'runId']);
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
      expect(card.last_full_run.id).toBe(run.id);
      const idleCard = body.agents.find((a: { agent_id: string }) => a.agent_id === idle.id);
      expect(idleCard).toMatchObject({ cases_total: 0, last_full_run: null, sparkline: [] });
      expect(body.agents).toHaveLength((await app.inject({ method: 'GET', url: '/agents' })).json().length);

      for (let i = 0; i < 25; i++) {
        await db().insert(t.evalRuns).values({
          workspaceId, agentId: idle.id, agentName: 'x', status: 'done', progressTotal: 1,
          config: card.last_full_run.config, caseIds: [], startedAt: new Date(Date.now() + (i + 1) * 1000),
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

  // ======================================================================
  // Design-parity delta (spec 2026-10-31-eval-design-parity)
  // ======================================================================
  const DIFF = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n a\n+b\n';
  const item = (over: Record<string, unknown> = {}) => ({
    kind: 'must_find',
    file: 'src/a.ts',
    start_line: 2,
    end_line: 2,
    severity: 'CRITICAL',
    category: 'security',
    ...over,
  });
  const draft = (over: Record<string, unknown> = {}) => ({
    name: 'case-a',
    input_diff: DIFF,
    input_files: [] as { path: string; content: string }[],
    pr_meta: { title: '', description: '' },
    expected: [item()],
    ...over,
  });
  const postCase = (agentId: string, body: unknown) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: body as object });
  const putCase = (id: string, body: unknown) =>
    app.inject({ method: 'PUT', url: `/eval-cases/${id}`, payload: body as object });
  const getAgent = async (id: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${id}` })).json() as Record<string, unknown> & {
      version: number;
      system_prompt: string;
    };
  const caseList = async (agentId: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json() as {
      id: string;
      name: string;
      revision: number;
      updated_at: string;
      input_diff: string;
      last_result: { run_id: string; case_revision: number } | null;
    }[];
  const ctx = () => ({ workspaceId, userId: 'u' });

  // ---------------------------------------------------------------- V12
  describe('editor cases (AC-D8..D12, D20..D22, D24, D35)', () => {
    it('creates a case: 201, revision 1, agent version unchanged, 0 LLM calls (AC-D21, AC-D93)', async () => {
      const agent = await createAgent();
      const res = await postCase(agent.id, draft({ pr_meta: { title: 'T', description: 'D' } }));
      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c).toMatchObject({
        name: 'case-a',
        revision: 1,
        pr_meta: { title: 'T', description: 'D' },
        input_files: [],
        source: null,
        display: null,
        last_result: null,
      });
      expect(c.expected).toEqual([item()]);
      expect((await getAgent(agent.id)).version).toBe(agent.version);
      expect(llm.calls).toHaveLength(0);
    });

    it('applies the kind default and stores CRLF diffs and files as LF (AC-D8e)', async () => {
      const agent = await createAgent();
      const crlf = DIFF.replace(/\n/g, '\r\n');
      const { kind: _k, ...noKind } = item();
      const res = await postCase(
        agent.id,
        draft({ input_diff: crlf, input_files: [{ path: 'src/ctx.ts', content: 'a\r\nb' }], expected: [noKind] }),
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().input_diff).toBe(DIFF);
      expect(res.json().input_files[0].content).toBe('a\nb');
      expect(res.json().expected[0].kind).toBe('must_find');
    });

    it.each([
      ['no_files', 'just some text', undefined],
      ['no_hunks', 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n', 'src/a.ts'],
      ['missing_file_header', '@@ -1,1 +1,2 @@\n a\n+b\n', undefined],
      [
        'ambiguous_multi_file',
        '--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n a\n+b\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,2 @@\n a\n+b\n',
        undefined,
      ],
    ])('rejects an unreviewable diff: %s (AC-D8a-d)', async (reason, diff, file) => {
      const agent = await createAgent();
      const res = await postCase(agent.id, draft({ input_diff: diff }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('invalid_diff');
      expect(res.json().error.details).toEqual({ reason, ...(file ? { file } : {}) });
      expect(await caseList(agent.id)).toHaveLength(0);
    });

    it.each([
      ['diff', () => draft({ input_diff: DIFF + `+${'x'.repeat(256 * 1024)}\n` })],
      ['file', () => draft({ input_files: [{ path: 'a.ts', content: 'x'.repeat(64 * 1024 + 1) }] })],
      [
        'files_total',
        () =>
          draft({
            input_files: [1, 2, 3, 4, 5].map((n) => ({ path: `f${n}.ts`, content: 'x'.repeat(60 * 1024) })),
          }),
      ],
      [
        'files_count',
        () => draft({ input_files: Array.from({ length: 11 }, (_, n) => ({ path: `f${n}.ts`, content: 'x' })) }),
      ],
      ['pr_title', () => draft({ pr_meta: { title: 'x'.repeat(201), description: '' } })],
      ['pr_description', () => draft({ pr_meta: { title: '', description: 'x'.repeat(8001) } })],
    ])('rejects input over the %s limit (AC-D10a)', async (limit, body) => {
      const agent = await createAgent();
      const res = await postCase(agent.id, body());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('input_too_large');
      expect(res.json().error.details).toEqual({ limit });
    });

    it('accepts the limits exactly: 10 files, 200-char title, 8,000-char description (AC-D10a)', async () => {
      const agent = await createAgent();
      const res = await postCase(
        agent.id,
        draft({
          input_files: Array.from({ length: 10 }, (_, n) => ({ path: `f${n}.ts`, content: 'x' })),
          pr_meta: { title: 'x'.repeat(200), description: 'x'.repeat(8000) },
        }),
      );
      expect(res.statusCode).toBe(201);
    });

    it('rejects bad names (invalid_name) and accepts 1..60 of a-z0-9- (AC-D12a)', async () => {
      const agent = await createAgent();
      for (const name of ['', 'Has Space', 'UPPER', 'a_b', 'x'.repeat(61)]) {
        const res = await postCase(agent.id, draft({ name }));
        expect(res.statusCode, name).toBe(422);
        expect(res.json().error.code).toBe('invalid_name');
      }
      expect((await postCase(agent.id, draft({ name: 'x'.repeat(60) }))).statusCode).toBe(201);
      expect((await postCase(agent.id, draft({ name: '0-9' }))).statusCode).toBe(201);
    });

    it('rejects a bad expected list with the JSON path (AC-D5)', async () => {
      const agent = await createAgent();
      const res = await postCase(agent.id, draft({ expected: [item(), item({ severity: 'critical' })] }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('invalid_expected_output');
      expect(res.json().error.details.path).toBe('$[1].severity');
      const dupe = await postCase(agent.id, draft({ input_files: [{ path: 'a', content: '' }, { path: 'a', content: '' }] }));
      expect(dupe.json().error.code).toBe('duplicate_file_path');
    });

    it('a duplicate name -> 409 eval_case_name_taken, also on rename; the same name on another agent is fine (AC-D12b)', async () => {
      const agent = await createAgent();
      const other = await createAgent();
      expect((await postCase(agent.id, draft())).statusCode).toBe(201);
      const dupe = await postCase(agent.id, draft());
      expect(dupe.statusCode).toBe(409);
      expect(dupe.json().error.code).toBe('eval_case_name_taken');
      expect((await postCase(other.id, draft())).statusCode).toBe(201);

      const second = (await postCase(agent.id, draft({ name: 'case-b' }))).json();
      const rename = await putCase(second.id, draft({ name: 'case-a' }));
      expect(rename.statusCode).toBe(409);
      expect(rename.json().error.code).toBe('eval_case_name_taken');
      expect((await caseList(agent.id)).find((c) => c.id === second.id)!.name).toBe('case-b');
    });

    it('a content edit bumps revision by 1, a rename does not; version stays (AC-D21, AC-D22)', async () => {
      const agent = await createAgent();
      const c = (await postCase(agent.id, draft())).json();
      const renamed = await putCase(c.id, draft({ name: 'renamed' }));
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json()).toMatchObject({ name: 'renamed', revision: 1 });

      const edits: Record<string, unknown>[] = [
        { input_diff: DIFF + '+c\n' },
        { input_files: [{ path: 'src/ctx.ts', content: 'x' }] },
        { pr_meta: { title: 'T', description: '' } },
        { expected: [item({ start_line: 1, end_line: 1 })] },
      ];
      let revision = 1;
      let current = draft({ name: 'renamed' });
      for (const edit of edits) {
        current = { ...current, ...edit };
        const res = await putCase(c.id, current);
        expect(res.statusCode).toBe(200);
        revision += 1;
        expect(res.json().revision).toBe(revision);
      }
      // saving identical content again is not a content change
      const same = await putCase(c.id, current);
      expect(same.json().revision).toBe(revision);
      expect(Date.parse(same.json().updated_at)).toBeGreaterThanOrEqual(Date.parse(c.updated_at));
      expect((await getAgent(agent.id)).version).toBe(agent.version);
      expect(llm.calls).toHaveLength(0);
    });

    it('a failed save leaves the stored case unchanged and logs the code only (AC-D20a, NFR-D7)', async () => {
      const agent = await createAgent();
      const c = (await postCase(agent.id, draft())).json();
      const lines: { obj: unknown; msg?: string }[] = [];
      const log = {
        info: (obj: unknown, msg?: string) => lines.push({ obj, ...(msg ? { msg } : {}) }),
        warn: (obj: unknown, msg?: string) => lines.push({ obj, ...(msg ? { msg } : {}) }),
      };
      const svc = new EvalService(app.container, log);
      await expect(
        svc.updateCase(ctx(), c.id, {
          ...draft({ input_diff: 'SECRET-DIFF-CONTENT', pr_meta: { title: 'SECRET-TITLE', description: '' } }),
        } as never),
      ).rejects.toMatchObject({ code: 'invalid_diff' });
      const after = (await caseList(agent.id))[0]!;
      expect(after.input_diff).toBe(DIFF);
      expect(after.revision).toBe(1);
      const rejected = lines.filter((l) => l.msg === 'eval case save rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.obj).toEqual({ code: 'invalid_diff' });
      expect(JSON.stringify(lines)).not.toContain('SECRET');
    });

    it('unknown case or other-workspace case -> 404 (PUT)', async () => {
      const res = await putCase('00000000-0000-4000-8000-000000000000', draft());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('eval_case_not_found');
      const agent = await createAgent();
      const c = (await postCase(agent.id, draft())).json();
      const svc = new EvalService(app.container);
      await expect(
        svc.updateCase({ workspaceId: randomUUID(), userId: 'u' }, c.id, draft() as never),
      ).rejects.toMatchObject({ code: 'eval_case_not_found' });
    });

    it('a legacy row is presented in the list shape and editing it writes the new columns (AC-D24)', async () => {
      const agent = await createAgent();
      const legacy = await addCase(agent.id);
      await db()
        .update(t.evalCases)
        .set({ expectedOutput: null, inputFiles: null, inputMeta: null })
        .where(eq(t.evalCases.id, legacy.case.id));
      const before = (await caseList(agent.id))[0] as unknown as { expected: unknown[]; pr_meta: unknown };
      expect(before.expected).toHaveLength(1);
      expect(before.pr_meta).toEqual({ title: '', description: '' });
      const res = await putCase(legacy.case.id, {
        ...draft({ name: legacy.case.name }),
        input_diff: (await caseList(agent.id))[0]!.input_diff,
        expected: before.expected,
      });
      // the diff here is the finding's file diff; same expected + same content => no revision bump
      expect(res.statusCode).toBe(200);
      expect(res.json().revision).toBe(1);
      const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, legacy.case.id));
      expect(Array.isArray(row!.expectedOutput)).toBe(true);
    });

    it('two updates computed from the same stale row each bump the revision in SQL (AC-D22)', async () => {
      const agent = await createAgent();
      const c = (await postCase(agent.id, draft())).json();
      const values = (diffTail: string) => ({
        name: 'case-a',
        inputDiff: DIFF + diffTail,
        inputFiles: [],
        inputMeta: { title: '', description: '' },
        expectedOutput: [item()] as never,
      });
      // both callers read revision 1 and (wrongly) believe nothing changed: the UPDATE decides
      const a = await caseRepo.updateCase(db(), workspaceId, c.id, values('+x\n'), false);
      const b = await caseRepo.updateCase(db(), workspaceId, c.id, values('+y\n'), false);
      expect(a).toMatchObject({ row: { revision: 2 } });
      expect(b).toMatchObject({ row: { revision: 3 } });
      const same = await caseRepo.updateCase(db(), workspaceId, c.id, values('+y\n'), true);
      expect(same).toMatchObject({ row: { revision: 3 } });
    });

    it('a decided finding whose file path breaks the expected-list schema -> 422 invalid_expected_output, nothing inserted (W2)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: 'accepted', file: `src/${'a'.repeat(297)}.ts` });
      const res = await app.inject({ method: 'POST', url: `/findings/${s.finding.id}/eval-case` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('invalid_expected_output');
      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
      expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).statusCode).toBe(200);
    });

    it('a legacy result row (old single-object expectation) still serialises: GET /eval-runs/:id is 200 (W1)', async () => {
      const agent = await createAgent();
      const [run] = await db().insert(t.evalRuns).values({ workspaceId, agentId: agent.id, agentName: 'x', status: 'done', progressTotal: 2, config: SNAPSHOT, caseIds: [] }).returning();
      await db().insert(t.evalCaseResults).values([
        { runId: run!.id, caseId: null, position: 0, caseName: 'old-find', expectation: { kind: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }, status: 'pass', summary: 's',
          findings: [{ file: 'src/a.ts', start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security', title: 't', label: 'tp' }] },
        { runId: run!.id, caseId: null, position: 1, caseName: 'old-nofind', expectation: { kind: 'must_find', file: 'src/b.ts', start_line: 1, end_line: 1 }, status: 'fail', summary: 's' },
        { runId: run!.id, caseId: null, position: 2, caseName: 'old-forbid', expectation: { kind: 'must_not_flag', file: 'src/c.ts', start_line: 1, end_line: 1 }, status: 'pass', summary: 's' },
      ]);
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${run!.id}` });
      expect(res.statusCode).toBe(200);
      const r = res.json().results;
      expect(r[0].expected[0]).toMatchObject({ kind: 'must_find', severity: 'CRITICAL', category: 'security' });
      expect(r[1].expected[0]).toMatchObject({ kind: 'must_find', severity: 'SUGGESTION', category: 'style' });
      expect(r[2].expected[0]).toEqual({ kind: 'must_not_flag', file: 'src/c.ts', start_line: 1, end_line: 1 });
    });

    it('finding draft: nothing persisted, content per AC-D35b, 0 LLM; linking on save; exists -> 409 (AC-D35a-d)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: null, title: 'Null deref' });
      const res = await app.inject({ method: 'GET', url: `/findings/${s.finding.id}/eval-case-draft` });
      expect(res.statusCode).toBe(200);
      const d = res.json();
      expect(d.name).toBe('null-deref');
      expect(d.input_files).toEqual([]);
      expect(d.pr_meta).toEqual({ title: '', description: '' });
      expect(d.input_diff).toContain(`diff --git a/${s.file} b/${s.file}`);
      expect(d.expected).toEqual([
        { kind: 'must_find', file: s.file, start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security', title: 'Null deref' },
      ]);
      expect(await caseList(agent.id)).toHaveLength(0);
      expect(llm.calls).toHaveLength(0);

      const saved = await postCase(agent.id, { ...d, source_finding_id: s.finding.id });
      expect(saved.statusCode).toBe(201);
      expect(saved.json().source).toMatchObject({ finding_id: s.finding.id });
      expect(saved.json().display).toMatchObject({ title: 'Null deref' });

      const again = await app.inject({ method: 'GET', url: `/findings/${s.finding.id}/eval-case-draft` });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('eval_case_exists');
      expect(again.json().error.details.case_id).toBe(saved.json().id);
      const link = await postCase(agent.id, { ...d, name: 'other-name', source_finding_id: s.finding.id });
      expect(link.statusCode).toBe(409);
      expect(link.json().error.code).toBe('eval_case_exists');
    });

    it('a 201-character finding title is clamped to 200 in the draft, not a serializer 500 (AC-D35b)', async () => {
      const agent = await createAgent();
      const s = await seedFinding({ agentId: agent.id, decision: null, title: 'T'.repeat(201) });
      const res = await app.inject({ method: 'GET', url: `/findings/${s.finding.id}/eval-case-draft` });
      expect(res.statusCode).toBe(200);
      expect(res.json().expected[0].title).toHaveLength(200);
      expect(res.json().name.length).toBeLessThanOrEqual(60);
    });

    it('finding draft errors: 404 unknown, 404 on save for another agent, 422 without agent (AC-D35)', async () => {
      const unknown = await app.inject({ method: 'GET', url: `/findings/${randomUUID()}/eval-case-draft` });
      expect(unknown.statusCode).toBe(404);
      const noAgent = await seedFinding({ agentId: null });
      const res = await app.inject({ method: 'GET', url: `/findings/${noAgent.finding.id}/eval-case-draft` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('finding_without_agent');
      const agent = await createAgent();
      const other = await createAgent();
      const s = await seedFinding({ agentId: agent.id });
      const wrong = await postCase(other.id, { ...draft(), source_finding_id: s.finding.id });
      expect(wrong.statusCode).toBe(404);
      expect(wrong.json().error.code).toBe('finding_not_found');
    });
  });

  // ---------------------------------------------------------------- V13
  describe('scope-case runs and the engine feed (AC-D13..D17, D26, D28, D29, D47)', () => {
    it('a case run is exactly one review, sets only that case\'s last_result, stores expected + revision (AC-D26, D28, D94)', async () => {
      const agent = await createAgent();
      const a = (await postCase(agent.id, draft({ name: 'one' }))).json();
      await postCase(agent.id, draft({ name: 'two' }));
      await putCase(a.id, draft({ name: 'one', expected: [item({ start_line: 1, end_line: 2 })] }));
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: a.id } });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toMatchObject({ scope: 'case', status: 'running', progress: { done: 0, total: 1 } });
      const done = await waitRun(res.json().id);
      expect(done.status).toBe('done');
      expect(llm.calls).toHaveLength(1);
      expect(done.results).toHaveLength(1);
      expect(done.results[0]).toMatchObject({ case_name: 'one', case_revision: 2, status: 'pass' });
      expect(done.results[0].expected).toHaveLength(1);
      const list = await caseList(agent.id);
      const one = list.find((c) => c.name === 'one')!;
      expect(one.last_result).toMatchObject({ run_id: res.json().id, case_revision: 2 });
      expect(list.find((c) => c.name === 'two')!.last_result).toBeNull();
    });

    it('a case outside the agent\'s set -> 404 eval_case_not_found, nothing created (AC-D25)', async () => {
      const agent = await createAgent();
      const other = await createAgent();
      const foreign = (await postCase(other.id, draft())).json();
      await postCase(agent.id, draft());
      for (const id of [foreign.id, randomUUID()]) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: id } });
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('eval_case_not_found');
      }
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    });

    it('409 eval_run_in_progress for any scope while a run is running or queued (AC-D29)', async () => {
      const agent = await createAgent();
      const c = (await postCase(agent.id, draft())).json();
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const first = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: c.id } })).json();
      for (const payload of [{ case_id: c.id }, {}]) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.details.run_id).toBe(first.id);
      }
      release();
      await waitRun(first.id);

      const queued = await db()
        .insert(t.evalRuns)
        .values({ workspaceId, agentId: agent.id, agentName: 'x', status: 'queued', progressTotal: 1, config: SNAPSHOT, caseIds: [] })
        .returning();
      for (const payload of [{ case_id: c.id }, undefined]) {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, ...(payload ? { payload } : {}) });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.details.run_id).toBe(queued[0]!.id);
      }
    });

    it('the model sees the diff, fenced Files and fenced "Title:" meta - nothing else (AC-D13, D15)', async () => {
      const agent = await createAgent();
      const files = [{ path: 'src/ctx.ts', content: 'export const FILE_MARK = 1;' }];
      const meta = { title: 'T-MARK', description: 'D-MARK' };
      const c = (await postCase(agent.id, draft({ input_files: files, pr_meta: meta }))).json();
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: c.id } });
      await waitRun(res.json().id);
      expect(llm.calls).toHaveLength(1);
      const expected = assemblePrompt({
        system: 'You are a reviewer. MARKER-A',
        diff: DIFF,
        contextFiles: files,
        prDescription: 'Title: T-MARK\n\nD-MARK',
      }).messages;
      expect(llm.prompts).toContainEqual(expected);
      const text = JSON.stringify(llm.prompts);
      expect(text).toContain('<untrusted');
      expect(github.posted).toHaveLength(0);
    });

    it('a finding citing a Files-only path is dropped by grounding and counted (AC-D17)', async () => {
      const agent = await createAgent();
      const c = (
        await postCase(agent.id, draft({ input_files: [{ path: 'src/ctx.ts', content: 'export const x = 1;\nexport const y = 2;' }] }))
      ).json();
      llm.citeFile = 'src/ctx.ts';
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: c.id } });
      const done = await waitRun(res.json().id);
      expect(done.results[0]).toMatchObject({ grounded: 0, dropped: 2, status: 'fail' });
    });

    it('a stored diff with no reviewable file -> case error, no LLM call (AC-D47)', async () => {
      const agent = await createAgent();
      const [row] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId, ownerKind: 'agent', ownerId: agent.id, agentId: agent.id, name: 'broken',
          inputDiff: 'this is not a diff', inputFiles: [], inputMeta: { title: '', description: '' }, expectedOutput: [item()],
        })
        .returning();
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs`, payload: { case_id: row!.id } });
      const done = await waitRun(res.json().id);
      expect(llm.calls).toHaveLength(0);
      expect(done.results[0]).toMatchObject({ status: 'error', summary: 'diff has no reviewable files' });
      expect(done.status).toBe('failed');
    });

    it('a legacy-expectation case still runs and scores (AC-D24)', async () => {
      const agent = await createAgent();
      const legacy = await addCase(agent.id);
      await db().update(t.evalCases).set({ expectedOutput: null }).where(eq(t.evalCases.id, legacy.case.id));
      const done = await waitRun((await startRun(agent.id)).json().id);
      expect(done.results[0]).toMatchObject({ status: 'pass', case_revision: 1 });
    });
  });

  // ---------------------------------------------------------------- V14
  describe('dashboards (AC-D27, D61, D62, D65, D66, D67, D82)', () => {
    async function insertRun(agentId: string, over: Partial<typeof t.evalRuns.$inferInsert> = {}) {
      const [r] = await db()
        .insert(t.evalRuns)
        .values({
          workspaceId, agentId, agentName: 'x', status: 'done', scope: 'all', progressTotal: 1,
          config: { ...SNAPSHOT, agent_version: 1 }, caseIds: [], recall: 0.9, precision: 0.8, citationAccuracy: 1,
          counts: { cases_total: 1, cases_scored: 1, cases_passed: 1, cases_failed: 0, cases_error: 0, must_find_total: 1, must_not_flag_total: 0, silent_total: 0, tp: 1, fn: 0, forbidden_hits: 0, unlabelled: 0, emitted: 1, grounded: 1, dropped: 0 },
          ...over,
        })
        .returning();
      return r!;
    }
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    it('rows and recent runs use finished full-set runs only; sparkline oldest to newest (AC-D27, D61, D62)', async () => {
      const agent = await createAgent();
      await postCase(agent.id, draft());
      await insertRun(agent.id, { startedAt: daysAgo(5), recall: 0.5 });
      await insertRun(agent.id, { startedAt: daysAgo(4), recall: null });
      await insertRun(agent.id, { startedAt: daysAgo(3), recall: 0.7 });
      const newestFull = await insertRun(agent.id, { startedAt: daysAgo(2), recall: 0.9 });
      const caseRun = await insertRun(agent.id, { startedAt: daysAgo(1), scope: 'case', recall: 0.1 });
      const failedRun = await insertRun(agent.id, { startedAt: daysAgo(0), status: 'failed', recall: null });
      const calls = llm.calls.length;
      const body = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
      expect(llm.calls.length).toBe(calls);
      const row = body.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
      expect(row.last_full_run.id).toBe(newestFull.id);
      expect(row.sparkline).toEqual([0.5, 0.7, 0.9]);
      expect(body.recent_runs.every((r: { scope: string; status: string }) => r.scope === 'all' && ['done', 'partial'].includes(r.status))).toBe(true);
      const ids = body.recent_runs.map((r: { id: string }) => r.id);
      expect(ids).not.toContain(caseRun.id);
      expect(ids).not.toContain(failedRun.id);
      expect(body.recent_runs.length).toBeLessThanOrEqual(20);
    });

    it('an agent with one full run has a one-point sparkline; sparkline capped at the last 10 (AC-D62)', async () => {
      const agent = await createAgent();
      await insertRun(agent.id, { recall: 0.4 });
      const many = await createAgent();
      for (let i = 0; i < 12; i++) await insertRun(many.id, { startedAt: daysAgo(20 - i), recall: i / 20 });
      const body = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
      const find = (id: string) => body.agents.find((a: { agent_id: string }) => a.agent_id === id);
      expect(find(agent.id).sparkline).toEqual([0.4]);
      expect(find(many.id).sparkline).toEqual(Array.from({ length: 10 }, (_, i) => (i + 2) / 20));
    });

    it('per-agent dashboard: range filter, both scopes in runs (<=50), series full-set only, latest/previous ignore range (AC-D65b, D66)', async () => {
      const agent = await createAgent();
      const old = await insertRun(agent.id, { startedAt: daysAgo(60), recall: 0.3 });
      const mid = await insertRun(agent.id, { startedAt: daysAgo(20), recall: 0.6 });
      const recent = await insertRun(agent.id, { startedAt: daysAgo(2), recall: 0.8 });
      await insertRun(agent.id, { startedAt: daysAgo(1), scope: 'case' });
      const get = async (q: string) =>
        (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard${q}` })).json();

      const d30 = await get('');
      expect(d30.range).toBe('30d');
      expect(d30.series.map((p: { run_id: string }) => p.run_id)).toEqual([mid.id, recent.id]);
      expect(d30.runs).toHaveLength(3);
      expect(d30.runs[0].scope).toBe('case');
      const d7 = await get('?range=7d');
      expect(d7.series.map((p: { run_id: string }) => p.run_id)).toEqual([recent.id]);
      expect(d7.latest.id).toBe(recent.id);
      expect(d7.previous.id).toBe(mid.id);
      const d90 = await get('?range=90d');
      expect(d90.series.map((p: { run_id: string }) => p.run_id)).toEqual([old.id, mid.id, recent.id]);
      expect(d90.series[0]).toMatchObject({ agent_version: 1, recall: 0.3, precision: 0.8, citation_accuracy: 1 });
      expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?range=1y` })).statusCode).toBe(422);
      expect((await app.inject({ method: 'GET', url: `/agents/${randomUUID()}/eval-dashboard` })).statusCode).toBe(404);

      const many = await createAgent();
      await db().insert(t.evalRuns).values(
        Array.from({ length: 55 }, (_, i) => ({
          workspaceId, agentId: many.id, agentName: 'x', status: 'done' as const, progressTotal: 1,
          config: SNAPSHOT, caseIds: [], startedAt: new Date(Date.now() - i * 1000),
        })),
      );
      const capped = (await app.inject({ method: 'GET', url: `/agents/${many.id}/eval-dashboard` })).json();
      expect(capped.runs).toHaveLength(50);
    });

    it('regression: null when nothing dropped by 1+ points, otherwise deltas and counts (AC-D82)', async () => {
      const a = await createAgent();
      await insertRun(a.id, { startedAt: daysAgo(3), recall: 0.9, precision: 0.8, citationAccuracy: 1 });
      await insertRun(a.id, { startedAt: daysAgo(2), recall: 0.95, precision: 0.8, citationAccuracy: 1 });
      const none = (await app.inject({ method: 'GET', url: `/agents/${a.id}/eval-dashboard` })).json();
      expect(none.regression).toBeNull();

      const b = await createAgent();
      await insertRun(b.id, { startedAt: daysAgo(3), recall: 0.9, precision: 0.8, citationAccuracy: 1 });
      const counts = { cases_total: 1, cases_scored: 1, cases_passed: 0, cases_failed: 1, cases_error: 0, must_find_total: 1, must_not_flag_total: 0, silent_total: 0, tp: 0, fn: 2, forbidden_hits: 1, unlabelled: 0, emitted: 1, grounded: 1, dropped: 0 };
      await insertRun(b.id, { startedAt: daysAgo(2), recall: 0.95, precision: 0.78, citationAccuracy: 1, config: { ...SNAPSHOT, agent_version: 4 }, counts });
      const r = (await app.inject({ method: 'GET', url: `/agents/${b.id}/eval-dashboard` })).json();
      expect(r.regression).toEqual({
        agent_version: 4,
        drops: [{ metric: 'precision', points: -2 }],
        rises: [{ metric: 'recall', points: 5 }],
        forbidden_hits_delta: 1,
        fn_delta: 2,
      });
      const one = await createAgent();
      await insertRun(one.id);
      expect((await app.inject({ method: 'GET', url: `/agents/${one.id}/eval-dashboard` })).json().regression).toBeNull();
      const empty = (await app.inject({ method: 'GET', url: `/agents/${randomUUID()}/eval-dashboard` })).statusCode;
      expect(empty).toBe(404);
    });

    it('eval-config returns the live snapshot with 0 LLM calls; config_id moves with the agent (AC-D54, D93)', async () => {
      const agent = await createAgent();
      const calls = llm.calls.length;
      const one = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-config` })).json();
      expect(one).toMatchObject({ agent_version: agent.version, provider: 'openai', model: 'gpt-4o-mini', skills: [] });
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'changed' } });
      const two = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-config` })).json();
      expect(two.config_id).not.toBe(one.config_id);
      expect(llm.calls.length).toBe(calls);
      expect((await app.inject({ method: 'GET', url: `/agents/${randomUUID()}/eval-config` })).statusCode).toBe(404);
    });

    it('soft timing: 20 agents x 200 full runs (logged, not asserted) (NFR-D1)', async () => {
      const ws = (await db().insert(t.workspaces).values({ name: `perf-${TAG}` }).returning())[0]!;
      const agents = await db()
        .insert(t.agents)
        .values(Array.from({ length: 20 }, (_, i) => ({ workspaceId: ws.id, name: `perf-${i}`, provider: 'openai' as const, model: 'm', systemPrompt: 'p' })))
        .returning();
      for (const a of agents) {
        await db().insert(t.evalRuns).values(
          Array.from({ length: 200 }, (_, i) => ({
            workspaceId: ws.id, agentId: a.id, agentName: a.name, status: 'done' as const, progressTotal: 1,
            config: SNAPSHOT, caseIds: [], recall: 0.5, startedAt: new Date(Date.now() - i * 60_000),
          })),
        );
      }
      const svc = new EvalService(app.container);
      const t0 = Date.now();
      const overview = await svc.dashboard({ workspaceId: ws.id, userId: 'u' });
      const t1 = Date.now();
      await svc.agentDashboard({ workspaceId: ws.id, userId: 'u' }, agents[0]!.id, '90d');
      const t2 = Date.now();
      // eslint-disable-next-line no-console
      console.info(`[evals perf] overview ${t1 - t0}ms, per-agent ${t2 - t1}ms`);
      expect(overview.agents).toHaveLength(20);
      expect(overview.agents[0]!.sparkline).toHaveLength(10);
    });
  });

  describe('skill links are workspace-scoped (S-1)', () => {
    it('linking a skill of another workspace is rejected and nothing is linked; a foreign linked row is invisible', async () => {
      const agent = await createAgent();
      const mine = (await app.inject({ method: 'POST', url: '/skills', payload: { name: `own-${seq++}-${TAG}`, type: 'custom', body: 'b' } })).json().id as string;
      const otherWs = (await db().insert(t.workspaces).values({ name: `skills-${TAG}-${seq++}` }).returning())[0]!.id;
      const [foreign] = await db().insert(t.skills).values({ workspaceId: otherWs, name: 'foreign', description: 'd', type: 'custom', source: 'manual', body: 'FOREIGN-BODY', enabled: true }).returning();

      const replace = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [mine, foreign!.id] } });
      expect(replace.statusCode).toBe(404);
      const append = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: foreign!.id } });
      expect(append.statusCode).toBe(404);
      expect(await db().select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agent.id))).toHaveLength(0);

      const ok = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [mine] } });
      expect(ok.statusCode).toBeLessThan(300);

      // a foreign row inserted directly is not returned to prompts / eval-config / the links list
      await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: foreign!.id, order: 5 });
      expect(await app.container.agentsRepo.enabledSkillsForPrompt(agent.id)).toHaveLength(1);
      const cfg = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-config` })).json();
      expect(cfg.skills.map((x: { skill_id: string }) => x.skill_id)).toEqual([mine]);
      const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
      expect(JSON.stringify(links)).not.toContain(foreign!.id);
    });
  });

  // ---------------------------------------------------------------- V15
  describe('promote (AC-D57..D59, D93)', () => {
    async function skill(name: string) {
      return (await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'custom', body: `body ${name}` } })).json().id as string;
    }
    const promote = (agentId: string, body: unknown) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/promote`, payload: body as object });
    const liveConfigId = async (agentId: string) =>
      (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-config` })).json().config_id as string;
    const linked = async (agentId: string) =>
      ((await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json() as { skill_id?: string; id?: string }[]).map((x) => x.skill_id ?? x.id);

    /** Agent with skills [s2, s1] and one case; run A captures that config, then the agent is edited. */
    async function scenario() {
      const s1 = await skill(`PS1-${seq++}-${TAG}`);
      const s2 = await skill(`PS2-${seq++}-${TAG}`);
      const agent = await createAgent();
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [s2, s1] } });
      await postCase(agent.id, draft());
      const runA = await waitRun((await startRun(agent.id)).json().id);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'EDITED prompt', model: 'gpt-4o', strategy: 'map-reduce' } });
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [s1] } });
      return { agent, runA, s1, s2 };
    }

    it('applies the run config as the next version: fields, exact ordered links, snapshot, other fields untouched, 0 LLM (AC-D57)', async () => {
      const { agent, runA, s1, s2 } = await scenario();
      const before = await getAgent(agent.id);
      const calls = llm.calls.length;
      const expectedId = await liveConfigId(agent.id);
      const lines: { obj: unknown; msg?: string }[] = [];
      const svc = new EvalService(app.container, { info: (obj, msg) => lines.push({ obj, ...(msg ? { msg } : {}) }), warn: () => {} });
      const out = await svc.promote(ctx(), agent.id, { run_id: runA.id, expected_config_id: expectedId });

      expect(out.version).toBe(before.version + 1);
      expect(out.agent).toMatchObject({ id: agent.id, version: before.version + 1, system_prompt: 'You are a reviewer. MARKER-A', model: 'gpt-4o-mini', strategy: 'single-pass', provider: 'openai' });
      const after = await getAgent(agent.id);
      for (const k of ['name', 'description', 'enabled', 'ci_fail_on', 'repo_intel', 'context_docs', 'output_schema']) {
        expect(after[k], k).toEqual(before[k]);
      }
      expect(await linked(agent.id)).toEqual([s2, s1]);
      const [snap] = await db().select().from(t.agentVersions).where(and(eq(t.agentVersions.agentId, agent.id), eq(t.agentVersions.version, before.version + 1)));
      expect(snap!.configJson).toMatchObject({ system_prompt: 'You are a reviewer. MARKER-A', model: 'gpt-4o-mini', skills: [s2, s1] });
      expect(llm.calls.length).toBe(calls);
      const log = lines.filter((l) => l.msg === 'eval config promoted');
      expect(log).toHaveLength(1);
      expect(log[0]!.obj).toEqual({ agentId: agent.id, runId: runA.id, from: before.version, to: before.version + 1 });
    });

    it('works through the route and the live config then differs from the old one (AC-D57)', async () => {
      const { agent, runA } = await scenario();
      const res = await promote(agent.id, { run_id: runA.id, expected_config_id: await liveConfigId(agent.id) });
      expect(res.statusCode).toBe(200);
      expect(res.json().agent.system_prompt).toBe('You are a reviewer. MARKER-A');
      expect(res.json().version).toBe(res.json().agent.version);
    });

    it('409 agent_changed when the live config is not the one the client saw; nothing changes (AC-D59a)', async () => {
      const { agent, runA } = await scenario();
      const before = await getAgent(agent.id);
      const res = await promote(agent.id, { run_id: runA.id, expected_config_id: 'stale' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('agent_changed');
      expect(await getAgent(agent.id)).toEqual(before);
    });

    it('409 already_current when the run config is the live config (AC-D54)', async () => {
      const agent = await createAgent();
      await postCase(agent.id, draft());
      const run = await waitRun((await startRun(agent.id)).json().id);
      const res = await promote(agent.id, { run_id: run.id, expected_config_id: await liveConfigId(agent.id) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('already_current');
    });

    it('422 skill_unavailable names the deleted skills; agent unchanged (AC-D59c)', async () => {
      const { agent, runA, s2 } = await scenario();
      const del = await app.inject({ method: 'DELETE', url: `/skills/${s2}` });
      expect(del.statusCode).toBeLessThan(300);
      const before = await getAgent(agent.id);
      const res = await promote(agent.id, { run_id: runA.id, expected_config_id: await liveConfigId(agent.id) });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('skill_unavailable');
      expect(res.json().error.details.skills).toHaveLength(1);
      expect(await getAgent(agent.id)).toEqual(before);
    });

    it('all-or-nothing: a failure after the writes rolls config, version, links and snapshot back (AC-D58)', async () => {
      const { agent, runA, s1 } = await scenario();
      const before = await getAgent(agent.id);
      const versionsBefore = await db().select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id));
      const spy = vi
        .spyOn(AgentsRepository.prototype as unknown as { snapshotVersion: () => Promise<void> }, 'snapshotVersion')
        .mockRejectedValueOnce(new Error('injected failure'));
      try {
        const res = await promote(agent.id, { run_id: runA.id, expected_config_id: await liveConfigId(agent.id) });
        expect(res.statusCode).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await getAgent(agent.id)).toEqual(before);
      expect(await linked(agent.id)).toEqual([s1]);
      expect(await db().select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id))).toHaveLength(versionsBefore.length);
    });

    it('404 for an unknown agent, and for a run that belongs to another agent or workspace', async () => {
      const { agent, runA } = await scenario();
      const other = await createAgent();
      expect((await promote(randomUUID(), { run_id: runA.id, expected_config_id: 'x' })).statusCode).toBe(404);
      const res = await promote(other.id, { run_id: runA.id, expected_config_id: 'x' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('eval_run_not_found');
      expect((await promote(agent.id, { run_id: randomUUID(), expected_config_id: 'x' })).json().error.code).toBe('eval_run_not_found');
    });
  });

  // ---------------------------------------------------------------- V16
  describe('batch runs (AC-D74..D81)', () => {
    let ws2: string;
    let n = 0;
    const ctx2 = () => ({ workspaceId: ws2, userId: 'u' });

    async function mkAgent(over: Partial<typeof t.agents.$inferInsert> = {}) {
      const [a] = await db()
        .insert(t.agents)
        .values({ workspaceId: ws2, name: `batch-${n++}-${TAG}`, provider: 'openai', model: 'm', systemPrompt: 'BATCH-PROMPT', ...over })
        .returning();
      return a!;
    }
    async function mkCase(agentId: string, name = `c${n++}`) {
      const [c] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId: ws2, ownerKind: 'agent', ownerId: agentId, agentId, name, inputDiff: DIFF,
          inputFiles: [], inputMeta: { title: '', description: '' }, expectedOutput: [item()],
        })
        .returning();
      return c!;
    }
    /** Container whose `anthropic` provider has no key, whatever this machine's secrets say. */
    function containerWithoutAnthropic() {
      return Object.create(app.container, {
        llm: {
          value: async (p: string) => {
            if (p === 'anthropic') throw new ConfigError('no key');
            return app.container.llm(p as 'openai');
          },
        },
      }) as typeof app.container;
    }
    async function runsOf(agentId: string) {
      return db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agentId));
    }
    async function settled(agentIds: string[]) {
      for (let i = 0; i < 400; i++) {
        const rows = await db().select().from(t.evalRuns).where(inArray(t.evalRuns.agentId, agentIds));
        if (rows.length > 0 && rows.every((r) => r.status !== 'running' && r.status !== 'queued')) return rows;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('batch did not settle');
    }

    beforeAll(async () => {
      ws2 = (await db().insert(t.workspaces).values({ name: `batch-${TAG}` }).returning())[0]!.id;
    });

    it('eligibility: one run per enabled agent with cases, no active run, key configured; every other agent skipped with its reason (AC-D75, D76, EC-D26)', async () => {
      const ok = await mkAgent();
      await mkCase(ok.id);
      const disabled = await mkAgent({ enabled: false });
      await mkCase(disabled.id);
      const noCases = await mkAgent();
      const noKey = await mkAgent({ provider: 'anthropic' });
      await mkCase(noKey.id);
      const busy = await mkAgent();
      await mkCase(busy.id);
      await db().insert(t.evalRuns).values({ workspaceId: ws2, agentId: busy.id, agentName: busy.name, status: 'queued', progressTotal: 1, config: SNAPSHOT, caseIds: [] });

      const lines: { obj: unknown; msg?: string }[] = [];
      const log = { info: (obj: unknown, msg?: string) => lines.push({ obj, ...(msg ? { msg } : {}) }), warn: () => {} };
      const svc = new EvalService(containerWithoutAnthropic(), log);
      const res = await svc.startBatch(ctx2());
      await settled([ok.id]);

      expect(res.started.map((s) => s.agent_id)).toEqual([ok.id]);
      expect(res.started[0]).toMatchObject({ agent_name: ok.name, cases: 1 });
      expect(res.queued).toEqual([]);
      const reason = (id: string) => res.skipped.find((s) => s.agent_id === id)?.reason;
      expect(reason(disabled.id)).toBe('disabled');
      expect(reason(noCases.id)).toBe('no_eval_cases');
      expect(reason(noKey.id)).toBe('provider_not_configured');
      expect(reason(busy.id)).toBe('eval_run_in_progress');
      expect(res.skipped).toHaveLength(4);
      const [row] = await runsOf(ok.id);
      expect(row).toMatchObject({ scope: 'all', status: 'done' });
      const line = lines.find((l) => l.msg === 'eval batch accepted');
      expect(line?.obj).toMatchObject({ started: 1, queued: 0, skipped: 4, reasons: { disabled: 1, no_eval_cases: 1, provider_not_configured: 1, eval_run_in_progress: 1 } });
      expect(JSON.stringify(lines)).not.toContain('BATCH-PROMPT');
      // cleanup so later batches in this workspace only see their own agents
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, ws2));
      await db().update(t.evalRuns).set({ status: 'failed' }).where(and(eq(t.evalRuns.workspaceId, ws2), eq(t.evalRuns.status, 'queued')));
    });

    it('2 run, the rest queue and start on settle; snapshot at accept, case content when the slot frees; LLM calls = sum of cases (AC-D79, D81, D94)', async () => {
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, ws2));
      const agents = [await mkAgent(), await mkAgent(), await mkAgent(), await mkAgent()];
      const cases = [];
      for (const a of agents) cases.push(await mkCase(a.id));
      llm.reset();
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));

      const svc = new EvalService(app.container);
      const res = await svc.startBatch(ctx2());
      const mine = (items: { agent_id: string }[]) => items.filter((i) => agents.some((a) => a.id === i.agent_id));
      expect(mine(res.started)).toHaveLength(2);
      expect(mine(res.queued)).toHaveLength(2);
      for (let i = 0; i < 100 && llm.maxInFlight < 2; i++) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 100));
      const statuses = async () => (await db().select().from(t.evalRuns).where(inArray(t.evalRuns.agentId, agents.map((a) => a.id)))).map((r) => r.status).sort();
      expect(await statuses()).toEqual(['queued', 'queued', 'running', 'running']);
      expect(llm.calls).toHaveLength(2);

      // edit the last queued agent AFTER accept: prompt must stay as captured, case content is read at the slot
      const lastQueued = res.queued[res.queued.length - 1]!;
      await db().update(t.agents).set({ systemPrompt: 'EDITED-AFTER-ACCEPT' }).where(eq(t.agents.id, lastQueued.agent_id));
      const queuedCase = cases.find((c) => c.agentId === lastQueued.agent_id)!;
      await db().update(t.evalCases).set({ expectedOutput: [item({ title: 'EDITED-AT-SLOT' })] }).where(eq(t.evalCases.id, queuedCase.id));

      release();
      const rows = await settled(agents.map((a) => a.id));
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.status === 'done')).toBe(true);
      expect(llm.calls).toHaveLength(4);
      expect(llm.maxInFlight).toBeLessThanOrEqual(2);
      const lastRun = rows.find((r) => r.id === lastQueued.run_id)!;
      expect((lastRun.config as { system_prompt: string }).system_prompt).toBe('BATCH-PROMPT');
      const detail = await svc.getRun(ctx2(), lastQueued.run_id);
      expect(detail.results[0].expected[0].title).toBe('EDITED-AT-SLOT');
      expect(JSON.stringify(llm.prompts)).not.toContain('EDITED-AFTER-ACCEPT');
    });

    it('two concurrent batches never run more than 2 at once; the rest stay queued (AC-D79)', async () => {
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, ws2));
      const ws3 = (await db().insert(t.workspaces).values({ name: `batch3-${TAG}` }).returning())[0]!.id;
      const mk = async (ws: string) => {
        const [a] = await db().insert(t.agents).values({ workspaceId: ws, name: `cc-${n++}-${TAG}`, provider: 'openai', model: 'm', systemPrompt: 'P' }).returning();
        await db().insert(t.evalCases).values({ workspaceId: ws, ownerKind: 'agent', ownerId: a!.id, agentId: a!.id, name: `c${n++}`, inputDiff: DIFF, inputFiles: [], inputMeta: { title: '', description: '' }, expectedOutput: [item()] });
        return a!.id;
      };
      const ids = [await mk(ws2), await mk(ws2), await mk(ws3), await mk(ws3)];
      llm.reset();
      let release!: () => void;
      llm.gate = new Promise<void>((r) => (release = r));
      const svc = new EvalService(app.container);
      const [r1, r2] = await Promise.all([svc.startBatch(ctx2()), svc.startBatch({ workspaceId: ws3, userId: 'u' })]);
      expect(r1.started.length + r2.started.length).toBe(2);
      expect(r1.queued.length + r2.queued.length).toBe(2);
      await new Promise((r) => setTimeout(r, 100));
      const statuses = async () => (await db().select().from(t.evalRuns).where(inArray(t.evalRuns.agentId, ids))).map((r) => r.status).sort();
      expect(await statuses()).toEqual(['queued', 'queued', 'running', 'running']);
      release();
      await settled(ids);
      expect(llm.maxInFlight).toBeLessThanOrEqual(2);
      expect(llm.calls).toHaveLength(4);
    });

    it('one agent\'s failed run does not affect the others (AC-D77, EC-D27)', async () => {
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, ws2));
      const bad = await mkAgent({ systemPrompt: 'FAILAGENT' });
      const good = await mkAgent();
      await mkCase(bad.id);
      await mkCase(good.id);
      llm.reset();
      llm.behave = (text) => (text.includes('FAILAGENT') ? new Error('bad model id') : 'default');
      await new EvalService(app.container).startBatch(ctx2());
      const rows = await settled([bad.id, good.id]);
      expect(rows.find((r) => r.agentId === bad.id)!.status).toBe('failed');
      expect(rows.find((r) => r.agentId === good.id)!.status).toBe('done');
    });

    it('a failure before the 202 creates no run (AC-D78b)', async () => {
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, ws2));
      const a = await mkAgent();
      const b = await mkAgent();
      await mkCase(a.id);
      await mkCase(b.id);
      let seen = 0;
      const exploding = Object.create(app.container, {
        llm: {
          value: async (p: string) => {
            if (++seen === 2) throw new Error('boom');
            return app.container.llm(p as 'openai');
          },
        },
      }) as typeof app.container;
      await expect(new EvalService(exploding).startBatch(ctx2())).rejects.toThrow('boom');
      expect(await runsOf(a.id)).toHaveLength(0);
      expect(await runsOf(b.id)).toHaveLength(0);
    });

    it('insertBatchRuns is one transaction with a savepoint per row (AC-D78b, D12)', async () => {
      const a = await mkAgent();
      const b = await mkAgent();
      const row = (agentId: string, status: 'running' | 'queued') => ({
        workspaceId: ws2, agentId, agentName: 'x', config: SNAPSHOT as never, caseIds: [], scope: 'all' as const, status,
      });
      // a concurrent conflict on one agent is reported, not fatal
      const ok = await runRepo.insertBatchRuns(db(), [row(a.id, 'running'), row(a.id, 'queued'), row(b.id, 'queued')]);
      expect(ok.created.map((r) => r.agentId)).toEqual([a.id, b.id]);
      expect(ok.conflicts).toEqual([a.id]);
      // any other failure (FK) rolls the whole batch back
      const c = await mkAgent();
      await expect(runRepo.insertBatchRuns(db(), [row(c.id, 'running'), row(randomUUID(), 'queued')])).rejects.toThrow();
      expect(await runsOf(c.id)).toHaveLength(0);
    });

    it('the boot reaper fails queued runs too (AC-D80, EC-D28)', async () => {
      const a = await mkAgent();
      const [q] = await db().insert(t.evalRuns).values({ workspaceId: ws2, agentId: a.id, agentName: a.name, status: 'queued', progressTotal: 1, config: SNAPSHOT, caseIds: [] }).returning();
      const n = await new EvalService(app.container).reapStaleRuns();
      expect(n).toBeGreaterThanOrEqual(1);
      const run = (await app.inject({ method: 'GET', url: `/eval-runs/${q!.id}` }));
      // run belongs to ws2, so the default-workspace route cannot see it: read the row
      expect(run.statusCode).toBe(404);
      const [row] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, q!.id));
      expect(row).toMatchObject({ status: 'failed', error: 'server restarted during run' });
      expect(row!.finishedAt).not.toBeNull();
    });

    it('POST /eval-runs/batch answers 202 with started / queued / skipped (AC-D74)', async () => {
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));
      const agent = await createAgent();
      await postCase(agent.id, draft());
      llm.reset();
      const res = await app.inject({ method: 'POST', url: '/eval-runs/batch' });
      expect(res.statusCode).toBe(202);
      const body = res.json();
      expect(body.started.map((s: { agent_id: string }) => s.agent_id)).toEqual([agent.id]);
      expect(body.queued).toEqual([]);
      expect(body.skipped.length).toBeGreaterThan(0);
      expect(body.skipped.every((s: { reason: string }) => typeof s.reason === 'string')).toBe(true);
      await settled([agent.id]);
    });
  });
});
