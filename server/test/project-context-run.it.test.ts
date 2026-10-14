import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForRunTrace } from './helpers/runs.js';
import { makeClone, insertRepoAndPr } from './helpers/project-context.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'ok',
  score: 50,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

type App = Awaited<ReturnType<typeof buildApp>>;

d('project-context run-time injection (DB-backed)', () => {
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

  async function mkApp(llm = new MockLLMProvider('openai', { structured: REVIEW })) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({}), llm: { openai: llm } },
    });
    return { llm, app };
  }

  let agentSeq = 0;
  async function mkAgent(app: App, docs: string[] = []) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `pc-run-${Date.now()}-${agentSeq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' },
      })
    ).json() as { id: string };
    if (docs.length) {
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { context_docs: docs } });
    }
    return agent;
  }

  async function mkSkill(app: App, docs: string[], enabled = true) {
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: `pc-skill-${Date.now()}-${agentSeq++}`, description: 'd', type: 'rubric', body: 'skill body', enabled },
      })
    ).json() as { id: string };
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context-docs`, payload: { context_docs: docs } });
    return skill;
  }

  async function bind(app: App, agentId: string, skillIds: string[]) {
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: skillIds } });
  }

  async function run(app: App, prId: string, body: object): Promise<{ trace: RunTrace; runIds: string[] }> {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: body });
    expect(res.statusCode).toBe(200);
    const runIds = (res.json().runs as Array<{ run_id: string }>).map((r) => r.run_id);
    const trace = (await waitForRunTrace(app, runIds[0]!)) as RunTrace;
    return { trace, runIds };
  }

  const tokensOf = (trace: RunTrace) => trace.log.map((l) => l.msg);

  it('order, dedupe, disabled skill excluded, Live log lines, wrapped text == prompt (AC-24, AC-25, AC-33, AC-35, AC-36)', async () => {
    const clone = await makeClone({
      'docs/own.md': 'agent doc',
      'docs/shared.md': 'shared doc',
      'specs/skill-a.md': 'skill a doc',
      'specs/skill-b.md': 'skill b doc',
      'specs/disabled.md': 'must not appear',
    });
    const { pr, repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/own.md', 'docs/shared.md']);
    const sA = await mkSkill(app, ['specs/skill-a.md', 'docs/shared.md']);
    const sB = await mkSkill(app, ['specs/skill-b.md', 'docs/gone.md']);
    const sOff = await mkSkill(app, ['specs/disabled.md'], false);
    await bind(app, agent.id, [sA.id, sB.id, sOff.id]);

    const { trace } = await run(app, pr.id, { agentId: agent.id });
    expect(trace.specs_read).toEqual(['docs/own.md', 'docs/shared.md', 'specs/skill-a.md', 'specs/skill-b.md']);
    expect(trace.specs_missing).toEqual(['docs/gone.md']);
    expect(trace.specs_docs.map((x) => [x.path, x.status, x.reason])).toEqual([
      ['docs/own.md', 'injected', null],
      ['docs/shared.md', 'injected', null],
      ['specs/skill-a.md', 'injected', null],
      ['specs/skill-b.md', 'injected', null],
      ['docs/gone.md', 'skipped', 'not_found'],
    ]);
    expect(trace.specs_docs.every((x) => x.repo === repo.fullName)).toBe(true);
    expect(trace.specs_docs[0]!.estimated_tokens).toBeGreaterThan(0);
    expect(trace.specs_docs.find((x) => x.status === 'skipped')).toMatchObject({
      estimated_tokens: null,
      wrapped_text: null,
    });
    const spec = trace.prompt_assembly.specs!;
    expect(spec).toBe(
      trace.specs_docs
        .filter((x) => x.status === 'injected')
        .map((x) => x.wrapped_text)
        .join('\n\n'),
    );
    expect(spec).not.toContain('must not appear');
    for (const doc of trace.specs_docs.filter((x) => x.status === 'injected')) {
      expect(doc.wrapped_text).toContain('<untrusted source="');
      expect(spec).toContain(doc.wrapped_text!);
    }
    const log = tokensOf(trace);
    expect(log).toContain('project context: skipped "docs/gone.md" (not_found)');
    expect(log.some((m) => /^project context: "docs\/own\.md" attached \(~\d+ tokens\)$/.test(m))).toBe(true);
    expect(log.some((m) => /^project context: 4 attached — ~\d+ tokens added to the prompt$/.test(m))).toBe(true);
    await app.close();
  });

  it('skipped reasons: too_large, unreadable, outside_repo, no_clone; run stays done (AC-28, AC-38, NFR-5)', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
    await writeFile(join(outside, 'leak.md'), 'LEAKED-SECRET');
    const clone = await makeClone({
      'docs/ok.md': 'fine',
      'docs/big.md': 'x'.repeat(512 * 1024 + 1),
      'docs/bad.md': Buffer.from([0xff, 0xfe]),
    });
    await symlink(join(outside, 'leak.md'), join(clone, 'docs/link.md'));
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/ok.md', 'docs/big.md', 'docs/bad.md', 'docs/link.md', 'docs/missing.md']);
    const { trace, runIds } = await run(app, pr.id, { agentId: agent.id });
    const reasons = Object.fromEntries(trace.specs_docs.map((x) => [x.path, x.reason]));
    expect(reasons).toEqual({
      'docs/ok.md': null,
      'docs/big.md': 'too_large',
      'docs/bad.md': 'unreadable',
      'docs/link.md': 'outside_repo',
      'docs/missing.md': 'not_found',
    });
    expect(trace.specs_read).toEqual(['docs/ok.md']);
    expect(JSON.stringify(trace)).not.toContain('LEAKED-SECRET');
    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runIds[0]!));
    expect(row!.status).toBe('done');

    const { pr: pr2 } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: null });
    const noClone = await run(app, pr2.id, { agentId: agent.id });
    expect(noClone.trace.specs_docs.map((x) => x.reason)).toEqual(Array(5).fill('no_clone'));
    expect(noClone.trace.specs_read).toEqual([]);
    expect(noClone.trace.specs_missing).toHaveLength(5);
    expect(noClone.trace.prompt_assembly.specs ?? null).toBeNull();
    expect(tokensOf(noClone.trace)).toContain('project context: none attached');
    await app.close();
  });

  it('zero attached: no section, prompt as today; provider call count equal with and without docs (AC-29, AC-30)', async () => {
    const clone = await makeClone({ 'docs/a.md': 'doc a' });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app, llm } = await mkApp();
    const plain = await mkAgent(app);
    const withDocs = await mkAgent(app, ['docs/a.md']);

    const r1 = await run(app, pr.id, { agentId: plain.id });
    const callsPlain = llm.calls.length;
    expect(r1.trace.prompt_assembly.specs ?? null).toBeNull();
    expect(r1.trace.specs_docs).toEqual([]);
    expect(JSON.stringify(llm.calls)).not.toContain('## Project context');
    llm.calls.length = 0;

    const r2 = await run(app, pr.id, { agentId: withDocs.id });
    expect(r2.trace.prompt_assembly.specs).toContain('doc a');
    expect(JSON.stringify(llm.calls)).toContain('## Project context');
    expect(llm.calls.length).toBe(callsPlain);
    expect(llm.calls.every((c) => c.method === 'completeStructured')).toBe(true);
    await app.close();
  });

  it('fresh read each run (AC-26) and the file edit shows in the next run', async () => {
    const clone = await makeClone({ 'docs/a.md': 'FIRST-VERSION' });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/a.md']);
    const a = await run(app, pr.id, { agentId: agent.id });
    expect(a.trace.prompt_assembly.specs).toContain('FIRST-VERSION');
    await writeFile(join(clone, 'docs/a.md'), 'SECOND-VERSION');
    const b = await run(app, pr.id, { agentId: agent.id });
    expect(b.trace.prompt_assembly.specs).toContain('SECOND-VERSION');
    expect(b.trace.prompt_assembly.specs).not.toContain('FIRST-VERSION');
    await app.close();
  });

  it('paths resolve in the PR own repo (AC-19, EC-18/19)', async () => {
    const cloneA = await makeClone({ 'docs/arch.md': 'REPO-A-TEXT' });
    const cloneB = await makeClone({ 'docs/arch.md': 'REPO-B-TEXT' });
    const a = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: cloneA, owner: 'orgA' });
    const b = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: cloneB, owner: 'orgB' });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/arch.md']);
    const ra = await run(app, a.pr.id, { agentId: agent.id });
    const rb = await run(app, b.pr.id, { agentId: agent.id });
    expect(ra.trace.prompt_assembly.specs).toContain('REPO-A-TEXT');
    expect(rb.trace.prompt_assembly.specs).toContain('REPO-B-TEXT');
    expect(rb.trace.prompt_assembly.specs).not.toContain('REPO-A-TEXT');
    expect(ra.trace.specs_docs[0]!.repo).toBe(a.repo.fullName);
    expect(rb.trace.specs_docs[0]!.repo).toBe(b.repo.fullName);
    await app.close();
  });

  it('all:true populates specs_read for the attaching agent (AC-31)', async () => {
    const clone = await makeClone({ 'docs/a.md': 'ALLRUN' });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    // The shared test DB accumulates enabled agents; keep only ours so all:true stays small.
    const wasEnabled = await pg.handle.db.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.enabled, true));
    await pg.handle.db.update(t.agents).set({ enabled: false });
    const agent = await mkAgent(app, ['docs/a.md']);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    const runs = res.json().runs as Array<{ run_id: string; agent_id: string }>;
    const mine = runs.find((r) => r.agent_id === agent.id);
    expect(mine).toBeDefined();
    const tr = (await waitForRunTrace(app, mine!.run_id)) as RunTrace;
    expect(tr.specs_read).toEqual(['docs/a.md']);
    for (const a of wasEnabled) await pg.handle.db.update(t.agents).set({ enabled: true }).where(eq(t.agents.id, a.id));
    await app.close();
  });

  it('attach lists are snapshotted at run start (AC-23)', async () => {
    const clone = await makeClone({ 'docs/a.md': 'AAA', 'docs/b.md': 'BBB' });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const { app } = await mkApp(llm);
    const agent = await mkAgent(app, ['docs/a.md']);
    const orig = llm.completeStructured.bind(llm);
    llm.completeStructured = (async (req: never) => {
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { context_docs: ['docs/b.md'] } });
      return orig(req);
    }) as typeof llm.completeStructured;
    const { trace } = await run(app, pr.id, { agentId: agent.id });
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.prompt_assembly.specs).toContain('AAA');
    expect(trace.prompt_assembly.specs).not.toContain('BBB');
    await app.close();
  });

  it('NFR-3: per-doc estimates sum within 5% of the logged specs slot (>= ~1k tokens)', async () => {
    const para = 'The api module must never import the db module directly; go through a repository. ';
    const clone = await makeClone({
      'docs/one.md': para.repeat(60),
      'specs/two.md': para.repeat(60),
    });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/one.md', 'specs/two.md']);
    const { trace } = await run(app, pr.id, { agentId: agent.id });
    const sum = trace.specs_docs.reduce((n, x) => n + (x.estimated_tokens ?? 0), 0);
    expect(sum).toBeGreaterThan(1000);
    const line = trace.log.map((l) => l.msg).find((m) => m.startsWith('Reviewer prompt composition'))!;
    const slot = Number(/specs (\d+)/.exec(line)![1]);
    expect(Math.abs(slot - sum) / slot).toBeLessThanOrEqual(0.05);
    await app.close();
  });

  it('server logs never carry document text (NFR-8): log lines hold paths and counts only', async () => {
    const clone = await makeClone({ 'docs/secret.md': 'PLANTED-MARKER-12345' });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const { app } = await mkApp();
    const agent = await mkAgent(app, ['docs/secret.md']);
    const { trace } = await run(app, pr.id, { agentId: agent.id });
    expect(trace.log.map((l) => l.msg).join('\n')).not.toContain('PLANTED-MARKER-12345');
    expect(trace.prompt_assembly.specs).toContain('PLANTED-MARKER-12345');
    await app.close();
  });

  it('legacy trace without specs_missing/specs_docs reads back with both as [] (AC-34, C5)', async () => {
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: null });
    const { app } = await mkApp();
    const agent = await mkAgent(app);
    const { trace, runIds } = await run(app, pr.id, { agentId: agent.id });
    const { specs_missing: _m, specs_docs: _d, ...legacy } = trace;
    await pg.handle.db.update(t.runTraces).set({ trace: legacy as never }).where(eq(t.runTraces.runId, runIds[0]!));
    const res = await app.inject({ method: 'GET', url: `/runs/${runIds[0]}/trace` });
    expect(res.statusCode).toBe(200);
    expect(res.json().specs_missing).toEqual([]);
    expect(res.json().specs_docs).toEqual([]);
    // a legacy trace that fails other validation still must not 500
    await pg.handle.db
      .update(t.runTraces)
      .set({ trace: { ...legacy, stats: { duration_ms: 'x' } } as never })
      .where(eq(t.runTraces.runId, runIds[0]!));
    const bad = await app.inject({ method: 'GET', url: `/runs/${runIds[0]}/trace` });
    expect(bad.statusCode).toBe(200);
    expect(bad.json().specs_docs).toEqual([]);
    await app.close();
  });
});
