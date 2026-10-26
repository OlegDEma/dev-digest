import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const INVARIANT = 'The api/ module must not import db/ directly; go through a repository.';
const PATCH = '@@ -1,2 +1,3 @@\n import { x } from "./x";\n+import { db } from "../db/client";\n export const y = 1;';
const DIFF = `diff --git a/api/orders.ts b/api/orders.ts\n--- a/api/orders.ts\n+++ b/api/orders.ts\n${PATCH}`;

/** Recorded structured reply: one finding on the added import, citing the invariant. */
const RECORDED: Review = {
  verdict: 'request_changes',
  summary: 'api/orders.ts imports db/ directly, violating the architecture spec.',
  score: 60,
  findings: [
    {
      id: 'f-arch',
      severity: 'WARNING',
      category: 'style',
      title: 'api/ imports db/ directly',
      file: 'api/orders.ts',
      start_line: 2,
      end_line: 2,
      rationale: `Violates the architecture invariant: ${INVARIANT}`,
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

d('AC-45 headline: an attached invariant spec yields a grounded finding (DB-backed, hermetic)', () => {
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

  it('attaches specs/architecture.md to the Security Reviewer, reviews a violating PR, keeps a grounded finding', async () => {
    const clone = await makeClone({ 'specs/architecture.md': `# Architecture\n\n${INVARIANT}\n` });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, {
      clonePath: clone,
      file: { path: 'api/orders.ts', patch: PATCH },
    });
    const llm = new MockLLMProvider('openai', { structured: RECORDED });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Security Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review security and architecture.' },
      })
    ).json();
    const attach = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context-docs`,
      payload: { context_docs: ['specs/architecture.md'] },
    });
    expect(attach.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id as string;
    const trace = (await waitForRunTrace(app, runId)) as RunTrace;

    // the invariant reached the model, inside the untrusted fence
    expect(trace.specs_read).toEqual(['specs/architecture.md']);
    expect(trace.prompt_assembly.specs).toContain(INVARIANT);
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="specs/architecture.md">');
    expect(JSON.stringify(llm.calls)).toContain(INVARIANT);

    // and a finding survived grounding, referencing the violation
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(1);
    const findings = reviews[0].findings as Array<{ file: string; start_line: number; rationale: string }>;
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]).toMatchObject({ file: 'api/orders.ts', start_line: 2 });
    expect(findings[0]!.rationale).toContain('must not import db/');
    expect(trace.stats.grounding).toBe('1/1 passed');
    await app.close();
  });
});
