import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** The slice of a persisted RunTrace these assertions read. */
type TraceShape = {
  prompt_assembly: { skills: string | null; user: string };
  log: { msg: string }[];
};

/** An approve-with-no-findings review: the prompt shape is what's under test. */
const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'Looks fine.', score: 100, findings: [] };

/** One grounded finding (line 11 is in DIFF) — feeds the Stats attribution test. */
const ONE_FINDING_REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Secret committed.',
  score: 65,
  findings: [
    {
      id: 'f-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed.',
      suggestion: 'Move it to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-repo-${repoSeq++}`;
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
      title: 'Add a config key',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc123',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * Skills — storage, version rule, agent binding and the one thing that makes
 * the feature real: a bound + enabled skill lands in the assembled prompt as a
 * `### <name>` block (and in the Live Log), an unbound / disabled one does not.
 */
d('skills (Testcontainers pg)', () => {
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

  function makeApp(llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  const skillBody = {
    name: 'no-then-chains',
    description: 'Flag promise .then() chains where async/await reads clearer.',
    type: 'convention',
    body: '# No .then() chains\n\nPrefer async/await over `.then()` chains.',
  };

  it('CRUD: create → v1 snapshot; content edit bumps; enabled toggle does not; delete cascades', async () => {
    const app = await makeApp();

    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ ...skillBody, source: 'manual', enabled: true, version: 1 });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { id: string }) => s.id === skill.id)).toMatchObject({ used_by: 0 });

    const toggled = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } })
    ).json();
    expect(toggled).toMatchObject({ enabled: false, version: 1 });

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: '# v2' } })
    ).json();
    expect(edited.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number; body: string }) => [v.version, v.body])).toEqual([
      [2, '# v2'],
      [1, skillBody.body],
    ]);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    const leftovers = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(leftovers).toHaveLength(0);

    await app.close();
  });

  it('import: a .md preview persists nothing until POST /skills; a .zip lists ignored members', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const md = '---\nname: imported-one\ndescription: Do the thing.\ntype: rubric\n---\n# Body';
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'imported-one.md', content_b64: Buffer.from(md).toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      name: 'imported-one',
      description: 'Do the thing.',
      type: 'rubric',
      body: '# Body',
      source: 'imported_url',
      ignored_entries: [],
    });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const { zipSync, strToU8 } = await import('fflate');
    const zip = zipSync({
      'pkg/SKILL.md': strToU8('# Zipped\n\nFrom an archive.'),
      'pkg/scripts/run.sh': strToU8('echo hi'),
    });
    const zipPreview = (
      await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { filename: 'pkg.zip', content_b64: Buffer.from(zip).toString('base64') },
      })
    ).json();
    expect(zipPreview).toMatchObject({ name: 'Zipped', core_entry: 'pkg/SKILL.md', ignored_entries: ['pkg/scripts/run.sh'] });
    expect(zipPreview.warnings[0]).toMatch(/looks executable/);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'x.exe', content_b64: Buffer.from('nope').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);

    await app.close();
  });

  it('binding: bound + enabled skills reach the prompt in order; unbound / disabled ones do not', async () => {
    const llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW });
    const app = await makeApp(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const first = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'first-skill' } })
    ).json();
    const second = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'second-skill' } })
    ).json();

    // Bind both, second before first — the prompt must follow this order.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, first.id] },
    });
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(agents.find((a: { id: string }) => a.id === agent.id).skill_count).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/skills/${first.id}/agents` })).json()).toEqual([
      { id: agent.id, name: 'Skilled' },
    ]);

    // Run 1: both skills attached.
    let res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    let runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    let trace = (await waitForRunTrace(app, runId)) as TraceShape;
    expect(trace.prompt_assembly.skills).toBe(
      `### second-skill\n${skillBody.body}\n\n### first-skill\n${skillBody.body}`,
    );
    expect(trace.prompt_assembly.user).toContain('## Skills / rules\n### second-skill');
    expect(trace.log.some((l: { msg: string }) => /skill "second-skill" attached/.test(l.msg))).toBe(true);
    expect(trace.log.some((l: { msg: string }) => /skills: 2 attached/.test(l.msg))).toBe(true);
    const sent = llm.calls.at(-1)?.req as { messages: { role: string; content: string }[] };
    expect(sent.messages[1]!.content).toContain('### second-skill');

    // Run 2: disable one globally, unbind the other → no skills section at all.
    await app.inject({ method: 'PUT', url: `/skills/${second.id}`, payload: { enabled: false } });
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [second.id] } });
    res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    trace = (await waitForRunTrace(app, runId)) as TraceShape;
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(trace.log.some((l: { msg: string }) => /skills: none bound/.test(l.msg))).toBe(true);

    await app.close();
  });

  it('stats: a run attributes itself and its findings to every skill in its prompt; accept rate follows the actions', async () => {
    const app = await makeApp(new MockLLMProvider('openai', { structured: ONE_FINDING_REVIEW }));
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Stats Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const tracked = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'tracked-skill' } })
    ).json();
    const idle = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'idle-skill' } })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [tracked.id] } });

    // Before any run with it: bound but never pulled. pull_pct is 0 when the
    // workspace already has runs (other tests) and null when it has none —
    // never a fabricated number; accept_pct has no acted-on findings → null.
    let stats = (await app.inject({ method: 'GET', url: `/skills/${tracked.id}/stats` })).json();
    expect(stats).toMatchObject({ used_by: 1, runs_with_skill_30d: 0, findings_30d: 0, accept_pct: null });
    expect(stats.pull_pct).toBe(stats.runs_30d === 0 ? null : 0);
    expect(stats.agents).toEqual([{ id: agent.id, name: 'Stats Agent' }]);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await waitForRunTrace(app, runId);

    // The link row carries the version that shaped the prompt.
    const rows = await pg.handle.db.select().from(t.agentRunSkills).where(eq(t.agentRunSkills.runId, runId));
    expect(rows).toEqual([{ runId, skillId: tracked.id, skillVersion: 1, position: 0 }]);

    stats = (await app.inject({ method: 'GET', url: `/skills/${tracked.id}/stats` })).json();
    expect(stats.runs_with_skill_30d).toBe(1);
    expect(stats.runs_30d).toBeGreaterThanOrEqual(1);
    expect(stats.pull_pct).toBeGreaterThan(0);
    expect(stats).toMatchObject({ findings_30d: 1, accepted_30d: 0, dismissed_30d: 0, accept_pct: null });

    // Accept the finding → 1 of 1 acted-on findings accepted.
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const findingId = reviews[0].findings[0].id as string;
    expect((await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })).statusCode).toBe(200);
    stats = (await app.inject({ method: 'GET', url: `/skills/${tracked.id}/stats` })).json();
    expect(stats).toMatchObject({ accepted_30d: 1, dismissed_30d: 0, accept_pct: 100 });

    // The rail row carries the same rates; the skill that was never pulled stays at "—".
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.find((s: { id: string }) => s.id === tracked.id)).toMatchObject({ accept_pct: 100 });
    expect(list.find((s: { id: string }) => s.id === idle.id)).toMatchObject({ pull_pct: 0, accept_pct: null, used_by: 0 });

    await app.close();
  });
});

