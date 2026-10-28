import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, type PgFixture } from './helpers/pg.js';
import { waitForRunTrace } from './helpers/runs.js';
import { makeClone, insertRepoAndPr } from './helpers/project-context.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';
import * as t from '../src/db/schema.js';
import type { RunTrace } from '@devdigest/shared';

/**
 * Opt-in live check of AC-45 with a REAL provider (costs money). Runs only with
 * DEVDIGEST_LIVE=1 — CI's `vitest run .it.test` matches this file, so the
 * describe is skipped otherwise. The key comes only from LocalSecretsProvider /
 * process.env, never from a fixture.
 */
const INVARIANT = 'The api/ module must not import db/ directly; go through a repository.';
const PATCH = '@@ -1,2 +1,3 @@\n import { x } from "./x";\n+import { db } from "../db/client";\n export const y = 1;';
const DIFF = `diff --git a/api/orders.ts b/api/orders.ts\n--- a/api/orders.ts\n+++ b/api/orders.ts\n${PATCH}`;

describe.skipIf(process.env.DEVDIGEST_LIVE !== '1')('AC-45 live: real provider grounds a finding on the attached invariant', () => {
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

  it('finds the api/ -> db/ violation', async () => {
    const secrets = new LocalSecretsProvider(loadConfig(process.env).secretsPath);
    const key = (await secrets.get('OPENAI_API_KEY')) ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not configured (secrets.json or env)');

    const clone = await makeClone({ 'specs/architecture.md': `# Architecture\n\n${INVARIANT}\n` });
    const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, {
      clonePath: clone,
      file: { path: 'api/orders.ts', patch: PATCH },
    });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }) },
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Security Reviewer (live)',
          provider: 'openai',
          model: 'gpt-4.1-mini',
          system_prompt: 'You review pull requests against the project context rules.',
        },
      })
    ).json();
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context-docs`, payload: { context_docs: ['specs/architecture.md'] } });
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id as string;
    const trace = (await waitForRunTrace(app, runId, 120_000)) as RunTrace;
    expect(trace.specs_read).toEqual(['specs/architecture.md']);
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const text = JSON.stringify(reviews[0].findings).toLowerCase();
    expect(reviews[0].findings.length).toBeGreaterThanOrEqual(1);
    expect(text).toMatch(/api\//);
    expect(text).toMatch(/db\//);
    await app.close();
  }, 180_000);
});
