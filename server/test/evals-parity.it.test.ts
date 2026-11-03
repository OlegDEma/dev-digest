import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GitClient, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitHubClient } from '../src/adapters/mocks.js';

/**
 * AC-D97 headline sequence, end to end over HTTP with a deterministic LLM:
 * hand case + silent case, Run case, run A at v6, edit (v7), run B, edit (v8),
 * Compare (both runs on the per-agent dashboard), Promote B (v7 config) -> v9.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF_A = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n a\n+b\n';
const DIFF_B = 'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,2 @@\n a\n+b\n';
const PROMPT_A = 'Reviewer prompt. MARKER-A';
const PROMPT_B = 'Reviewer prompt. MARKER-B';

/** MARKER-A: one grounded CRITICAL/security finding at line 2 of the diff's file. MARKER-B: stays silent. */
class MarkerLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const text = JSON.stringify(req.messages);
    const file = /diff --git a\/([^\s\\]+)/.exec(text)?.[1] ?? 'x.ts';
    const noisy = text.includes('MARKER-A');
    const review: Review = {
      verdict: 'comment',
      summary: 's',
      score: 80,
      findings: noisy
        ? [
            {
              id: 'f1', severity: 'CRITICAL', category: 'security', title: 'finding', file,
              start_line: 2, end_line: 2, rationale: 'r', confidence: 0.9, kind: 'finding',
            },
          ]
        : [],
    };
    return { data: review as unknown as T, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.002, raw: '{}', attempts: 1 };
  }
}

d('eval design parity - headline sequence (pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  const llm = new MarkerLLM('openai');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: { diff: async () => '' } as unknown as GitClient, github: new MockGitHubClient(), llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const json = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}) });
    return { status: res.statusCode, body: res.json() };
  };
  async function wait(runId: string) {
    for (let i = 0; i < 200; i++) {
      const { body } = await json('GET', `/eval-runs/${runId}`);
      if (body.status !== 'running' && body.status !== 'queued') return body;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('run did not finish');
  }
  const caseBody = (name: string, diff: string, file: string, expected: unknown[]) => ({
    name,
    input_diff: diff,
    input_files: [],
    pr_meta: { title: '', description: '' },
    expected,
  });

  it('hand case, silent case, Run case, A at v6, edit v7, B, edit v8, Compare, Promote -> v9 (AC-D97, D93, D94)', async () => {
    const agent = (await json('POST', '/agents', { name: `Parity ${Date.now()}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: PROMPT_A })).body as { id: string; version: number };

    const hand = await json('POST', `/agents/${agent.id}/eval-cases`, caseBody('hand-case', DIFF_A, 'src/a.ts', [
      { kind: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security' },
    ]));
    const silent = await json('POST', `/agents/${agent.id}/eval-cases`, caseBody('silent-case', DIFF_B, 'src/b.ts', []));
    expect([hand.status, silent.status]).toEqual([201, 201]);
    expect(llm.calls).toHaveLength(0); // creating cases costs nothing

    // Run case: exactly one review each, scope case, sets that case's last_result
    const runHand = await json('POST', `/agents/${agent.id}/eval-runs`, { case_id: hand.body.id });
    expect(runHand.status).toBe(202);
    const handDone = await wait(runHand.body.id);
    expect(handDone).toMatchObject({ scope: 'case', status: 'done' });
    expect(handDone.results[0].status).toBe('pass');
    const runSilent = await json('POST', `/agents/${agent.id}/eval-runs`, { case_id: silent.body.id });
    const silentDone = await wait(runSilent.body.id);
    expect(silentDone.results[0]).toMatchObject({ status: 'fail', summary: 'expected 0 findings, got 1' });
    expect(llm.calls).toHaveLength(2);

    // bring the agent to v6, then run A (full set)
    let version = agent.version;
    for (let i = 0; version < 6; i++) {
      const bump = await json('PUT', `/agents/${agent.id}`, { system_prompt: `${PROMPT_A} rev ${i}` });
      version = bump.body.version;
    }
    expect(version).toBe(6);
    const runA = await wait((await json('POST', `/agents/${agent.id}/eval-runs`)).body.id);
    expect(runA).toMatchObject({ scope: 'all', status: 'done' });
    expect(runA.config.agent_version).toBe(6);
    expect(runA.metrics.recall).toBe(1);
    expect(runA.counts).toMatchObject({ cases_total: 2, cases_passed: 1, cases_failed: 1, silent_total: 1, forbidden_hits: 1, tp: 1, fn: 0 });
    expect(llm.calls).toHaveLength(4);

    // edit -> v7 (config B), run B
    const v7 = await json('PUT', `/agents/${agent.id}`, { system_prompt: PROMPT_B });
    expect(v7.body.version).toBe(7);
    const runB = await wait((await json('POST', `/agents/${agent.id}/eval-runs`)).body.id);
    expect(runB.config.agent_version).toBe(7);
    expect(runB.metrics.recall).toBe(0);
    expect(runB.counts).toMatchObject({ cases_passed: 1, cases_failed: 1, fn: 1, forbidden_hits: 0 });
    expect(llm.calls).toHaveLength(6);

    // edit -> v8
    const v8 = await json('PUT', `/agents/${agent.id}`, { system_prompt: `${PROMPT_B} later edit` });
    expect(v8.body.version).toBe(8);

    // Compare: both runs on the per-agent dashboard, regression from A to B
    const dash = (await json('GET', `/agents/${agent.id}/eval-dashboard?range=30d`)).body;
    expect(dash.series.map((p: { run_id: string; agent_version: number }) => [p.run_id, p.agent_version])).toEqual([
      [runA.id, 6],
      [runB.id, 7],
    ]);
    expect(dash.latest.id).toBe(runB.id);
    expect(dash.previous.id).toBe(runA.id);
    expect(dash.regression).toMatchObject({ agent_version: 7, forbidden_hits_delta: -1, fn_delta: 1 });
    expect(dash.regression.drops).toEqual([{ metric: 'recall', points: -100 }]);
    // scope-case runs are in the table but not in the series
    expect(dash.runs.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([runHand.body.id, runSilent.body.id, runA.id, runB.id]));
    expect(dash.series).toHaveLength(2);

    // Promote B (the v7 config) while the agent is at v8 -> v9, zero LLM calls
    const callsBefore = llm.calls.length;
    const live = (await json('GET', `/agents/${agent.id}/eval-config`)).body;
    expect(live.agent_version).toBe(8);
    expect(live.config_id).not.toBe(runB.config.config_id);
    const promoted = await json('POST', `/agents/${agent.id}/promote`, { run_id: runB.id, expected_config_id: live.config_id });
    expect(promoted.status).toBe(200);
    expect(promoted.body.version).toBe(9);
    expect(promoted.body.agent).toMatchObject({ version: 9, system_prompt: PROMPT_B });
    expect(llm.calls).toHaveLength(callsBefore);
    expect(llm.calls).toHaveLength(6); // = reviews of the cases that were run, nothing else

    // a second Promote with the now-stale id is refused
    const stale = await json('POST', `/agents/${agent.id}/promote`, { run_id: runB.id, expected_config_id: live.config_id });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('agent_changed');
  });
});
