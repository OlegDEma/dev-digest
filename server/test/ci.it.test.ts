import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { eq } from 'drizzle-orm';
import { AgentManifest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import ciRoutes from '../src/modules/ci/routes.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const RUNNER_REF = 'acme/dev-digest/agent-runner@v9';
const TEST_SECRET = 'sk-or-v1-test-secret-should-never-leak';

const zipOf = (json: unknown | string) =>
  zipSync({
    'devdigest-result.json': strToU8(typeof json === 'string' ? json : JSON.stringify(json)),
  });
const result = (n: number, agent = 'CI Agent') => ({
  findings_count: n,
  cost_usd: 0.02,
  duration_ms: 4200,
  agent,
  pr_number: 12,
});

d('CI module (Part B)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  const repoName = `ci-${randomUUID().slice(0, 8)}`;
  const fullName = `acme/${repoName}`;

  beforeAll(async () => {
    pg = await startPg();
    const s = await seed(pg.handle.db);
    workspaceId = s.workspaceId;
    await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: repoName, fullName });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp(gh: MockGitHubClient) {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEVDIGEST_RUNNER_REF: RUNNER_REF,
    } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: gh },
    });
    if (!app.hasRoute({ method: 'GET', url: '/ci-runs' })) await app.register(ciRoutes);
    return app;
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name = 'CI Agent') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function addSkills(id: string) {
    const [on] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: 'On Skill', description: 'd', type: 'custom', source: 'manual', body: 'ON BODY', enabled: true })
      .returning();
    const [off] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: 'Off Skill', description: 'd', type: 'custom', source: 'manual', body: 'OFF BODY', enabled: false })
      .returning();
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: id, skillId: on!.id, order: 0 },
      { agentId: id, skillId: off!.id, order: 1 },
    ]);
  }

  it('preview: action=files returns workflow + manifest + enabled skill files, touching nothing', async () => {
    const gh = new MockGitHubClient();
    const app = await makeApp(gh);
    agentId = await createAgent(app);
    await addSkills(agentId);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo: fullName, action: 'files', post_as: 'pr_comment' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBeNull();
    expect(body.installation.id).toBe('');
    const paths = body.files.map((f: { path: string }) => f.path);
    expect(paths).toEqual([
      '.github/workflows/devdigest-review.yml',
      '.devdigest/agents/ci-agent.yaml',
      '.devdigest/skills/on-skill.md',
    ]);
    const byPath = Object.fromEntries(body.files.map((f: { path: string; contents: string }) => [f.path, f.contents]));
    const manifest = AgentManifest.parse(JSON.parse(byPath['.devdigest/agents/ci-agent.yaml']));
    expect(manifest.post_as).toBe('pr_comment');
    expect(manifest.skills).toEqual(['on-skill']);
    const wf = byPath['.github/workflows/devdigest-review.yml'] as string;
    expect(wf).toContain(`uses: "${RUNNER_REF}"`);
    expect(wf).toMatch(/if: always\(\)/);
    expect(wf).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(wf).not.toMatch(/head\.sha|head\.ref|refs\/pull|merge/);
    expect(wf).toContain('secrets.OPENROUTER_API_KEY');
    for (const f of body.files) expect(f.contents).not.toContain(TEST_SECRET);

    expect(gh.committed).toHaveLength(0);
    expect(gh.openedPrs).toHaveLength(0);
    const installs = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agentId));
    expect(installs).toHaveLength(0);
    await app.close();
  });

  it('validation: unconnected repo, unsupported target, unknown trigger, unknown agent', async () => {
    const app = await makeApp(new MockGitHubClient());
    const url = `/agents/${agentId}/export-ci`;
    const r1 = await app.inject({ method: 'POST', url, payload: { repo: 'nope/nope', action: 'files' } });
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.code).toBe('repo_not_connected');
    const r2 = await app.inject({ method: 'POST', url, payload: { repo: fullName, target: 'circle' } });
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error.code).toBe('unsupported_target');
    const r3 = await app.inject({ method: 'POST', url, payload: { repo: fullName, triggers: ['opened', 'x: y'] } });
    expect(r3.statusCode).toBe(422);
    expect(r3.json().error.code).toBe('invalid_triggers');
    const r4 = await app.inject({
      method: 'POST',
      url: `/agents/${randomUUID()}/export-ci`,
      payload: { repo: fullName },
    });
    expect(r4.statusCode).toBe(404);
    await app.close();
  });

  it('publish: one commit on devdigest/ci, PR reused on re-publish, one installation per (agent, repo, target)', async () => {
    const gh = new MockGitHubClient();
    const app = await makeApp(gh);
    const url = `/agents/${agentId}/export-ci`;
    const payload = { repo: fullName, action: 'open_pr', base: 'develop' };

    const first = await app.inject({ method: 'POST', url, payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(first.json().installation.id).not.toBe('');
    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0]).toMatchObject({ branch: 'devdigest/ci', base: 'develop' });
    expect(gh.committed[0]!.files.map((f) => f.path)).toContain('.github/workflows/devdigest-review.yml');
    expect(gh.openedPrs).toHaveLength(1);
    expect(gh.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: 'devdigest/ci', base: 'develop' });

    const second = await app.inject({ method: 'POST', url, payload });
    expect(second.statusCode).toBe(200);
    expect(gh.committed).toHaveLength(2);
    expect(gh.openedPrs).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci-installations` });
    expect(list.statusCode).toBe(200);
    // Republish to the same repo is idempotent: still exactly one installation row.
    expect(list.json()).toHaveLength(1);
    expect(second.json().installation.id).toBe(first.json().installation.id);
    expect(list.json()[0]).toMatchObject({ repo: fullName, target_type: 'gha', agent_id: agentId });
    await app.close();
  });

  it('publish: GitHub error -> 502 github_write_failed and no installation', async () => {
    const app = await makeApp(new MockGitHubClient({ commitError: 'Resource not accessible by personal access token' }));
    const other = await createAgent(app, 'Failing Agent');
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${other}/export-ci`,
      payload: { repo: fullName, action: 'open_pr' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('github_write_failed');
    expect(res.json().error.message).toContain('Resource not accessible');
    const rows = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, other));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('other workspace agent -> 404 on installations list', async () => {
    const app = await makeApp(new MockGitHubClient());
    const res = await app.inject({ method: 'GET', url: `/agents/${randomUUID()}/ci-installations` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  describe('refresh', () => {
    const opts = (): MockGitHubOptions => ({
      workflowRuns: [
        { id: '1001', conclusion: 'success', created_at: '2026-10-20T10:00:00Z', html_url: 'https://github.com/acme/x/actions/runs/1001' },
        { id: '1002', conclusion: 'failure', created_at: '2026-10-21T10:00:00Z', html_url: 'https://github.com/acme/x/actions/runs/1002' },
        { id: '1003', conclusion: 'success', created_at: '2026-10-22T10:00:00Z', html_url: 'https://github.com/acme/x/actions/runs/1003' },
        { id: '1004', conclusion: 'success', created_at: '2026-10-23T10:00:00Z', html_url: 'u' },
        { id: '1005', conclusion: null, created_at: '2026-10-24T10:00:00Z', html_url: 'u' },
      ],
      runArtifacts: {
        '1001': [{ id: 1, name: 'devdigest-result', expired: false }],
        '1002': [{ id: 2, name: 'devdigest-result', expired: false }],
        '1003': [{ id: 3, name: 'devdigest-result', expired: false }],
        '1004': [{ id: 4, name: 'devdigest-result', expired: false }],
      },
      artifactZips: {
        1: zipOf(result(3)),
        2: zipOf(result(1)),
        3: zipOf('{not json'),
        4: 'expired',
      },
    });

    it('ingests each run once, skips invalid/expired, derives status, lists newest first', async () => {
      const app = await makeApp(new MockGitHubClient(opts()));
      const first = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ ingested: 2, skipped: 2 });

      const again = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
      expect(again.json().ingested).toBe(0);

      const runs = (await app.inject({ method: 'GET', url: '/ci-runs' })).json();
      expect(runs).toHaveLength(2);
      expect(runs[0]).toMatchObject({ status: 'failed', findings_count: 1, source: 'gha', pr_number: 12, duration_s: 4.2, agent: 'CI Agent' });
      expect(runs[1]).toMatchObject({ status: 'succeeded', findings_count: 3 });
      expect(runs[0].github_url).toContain('/runs/1002');
      const stored = await pg.handle.db.select().from(t.ciRuns);
      expect(new Set(stored.map((r) => r.githubRunId)).size).toBe(stored.length);
      await app.close();
    });

    it('read error -> 502 github_read_failed and existing rows stay', async () => {
      const app = await makeApp(new MockGitHubClient({ actionsError: 'rate limited' }));
      const res = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('github_read_failed');
      const runs = (await app.inject({ method: 'GET', url: '/ci-runs' })).json();
      expect(runs).toHaveLength(2);
      await app.close();
    });

    it('an out-of-range artifact is skipped and the other runs are still ingested', async () => {
      const gh = new MockGitHubClient({
        workflowRuns: [
          { id: '2001', conclusion: 'success', created_at: '2026-10-25T10:00:00Z', html_url: 'u1' },
          { id: '2002', conclusion: 'success', created_at: '2026-10-26T10:00:00Z', html_url: 'u2' },
        ],
        runArtifacts: {
          '2001': [{ id: 21, name: 'devdigest-result', expired: false }],
          '2002': [{ id: 22, name: 'devdigest-result', expired: false }],
        },
        artifactZips: { 21: zipOf(result(3_000_000_000)), 22: zipOf(result(1)) },
      });
      const app = await makeApp(gh);
      const res = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ingested: 1, skipped: 1 });
      await app.close();
    });

    it('GET /ci-runs returns at most 100 newest first', async () => {
      const [inst] = await pg.handle.db.select().from(t.ciInstallations).limit(1);
      await pg.handle.db.insert(t.ciRuns).values(
        Array.from({ length: 105 }, (_, i) => ({
          ciInstallationId: inst!.id,
          githubRunId: `bulk-${i}`,
          ranAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
          status: 'succeeded',
          findingsCount: 1,
          source: 'gha',
        })),
      );
      const app = await makeApp(new MockGitHubClient());
      const runs = (await app.inject({ method: 'GET', url: '/ci-runs' })).json();
      expect(runs).toHaveLength(100);
      const times = runs.map((r: { ran_at: string }) => r.ran_at);
      expect([...times].sort().reverse()).toEqual(times);
      await app.close();
    });
  });
});
