import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { insertRepoAndPr, seedIndex } from './helpers/onboarding.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDb = await dockerAvailable();
const d = hasDb ? describe : describe.skip;

const cfg = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...extra } as NodeJS.ProcessEnv);

d('repo-intel onboarding snapshot (DB-backed)', () => {
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

  const svc = (extra: Record<string, string> = {}) =>
    new RepoIntelService(new Container(cfg(extra), pg.handle.db));

  it('AC-22: counts importers and endpoints, pins the repo map to the snapshot sha', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId);
    await seedIndex(pg.handle.db, repo.id, {
      sha: 'abc123',
      files: [
        { path: 'src/core.ts', pagerank: 0.5, percentile: 98, endpoints: ['GET /health', 'POST /x'] },
        { path: 'src/a.ts', pagerank: 0.2, percentile: 60 },
        { path: 'src/b.ts', pagerank: 0.1, percentile: 30 },
      ],
      edges: [
        ['src/a.ts', 'src/core.ts'],
        ['src/b.ts', 'src/core.ts'],
        ['src/b.ts', 'src/a.ts'],
      ],
      repoMap: 'MAP-TEXT',
      stats: { totalCandidates: 12450, bounded: 7450, hotnessAvailable: false },
    });
    await pg.handle.db
      .insert(t.repoMapCache)
      .values({ repoId: repo.id, commitSha: 'newer-sha', tokenBudget: 1500, mapText: 'NEWER-MAP', tokenCount: 5 });
    const snap = await svc().getOnboardingSnapshot(repo.id);
    expect(snap).toMatchObject({
      enabled: true,
      status: 'full',
      lastIndexedSha: 'abc123',
      totalCandidates: 12450,
      bounded: 7450,
      hotnessAvailable: false,
      edgeCount: 3,
      repoMap: 'MAP-TEXT',
    });
    const by = Object.fromEntries(snap.files.map((f) => [f.path, f]));
    expect(by['src/core.ts']).toMatchObject({ importers: 2, percentile: 98, endpoints: ['GET /health', 'POST /x'] });
    expect(by['src/a.ts']).toMatchObject({ importers: 1, endpoints: [] });
    expect(by['src/b.ts']).toMatchObject({ importers: 0 });
  });

  it('a repo map cached only for another sha is not returned', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId);
    await seedIndex(pg.handle.db, repo.id, { sha: 'abc123', files: [{ path: 'src/a.ts', pagerank: 1 }] });
    await pg.handle.db
      .insert(t.repoMapCache)
      .values({ repoId: repo.id, commitSha: 'other-sha', tokenBudget: 1500, mapText: 'OTHER-MAP', tokenCount: 5 });
    expect((await svc().getOnboardingSnapshot(repo.id)).repoMap).toBeNull();
  });

  it('AC-9: stats without walk keys give nulls (after an incremental refresh)', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId);
    await seedIndex(pg.handle.db, repo.id, {
      status: 'partial',
      files: [{ path: 'src/a.ts', pagerank: 1 }],
      stats: { durationMs: 5 },
    });
    const stats = await svc().getOnboardingIndexStats(repo.id);
    expect(stats).toMatchObject({
      enabled: true,
      status: 'partial',
      filesIndexed: 1,
      totalCandidates: null,
      bounded: null,
    });
    const snap = await svc().getOnboardingSnapshot(repo.id);
    expect(snap.repoMap).toBeNull();
  });

  it('AC-24: no state row reads as degraded; flag off reads as enabled false', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId);
    const none = await svc().getOnboardingSnapshot(repo.id);
    expect(none).toMatchObject({ enabled: true, status: 'degraded', files: [], edgeCount: 0 });
    await seedIndex(pg.handle.db, repo.id, { files: [{ path: 'src/a.ts', pagerank: 1 }] });
    const off = await svc({ REPO_INTEL_ENABLED: 'false' }).getOnboardingSnapshot(repo.id);
    expect(off).toMatchObject({ enabled: false, status: 'degraded', files: [], repoMap: null });
    expect((await svc({ REPO_INTEL_ENABLED: 'false' }).getOnboardingIndexStats(repo.id)).enabled).toBe(false);
  });

  it('AC-8: stats read does not touch the walk keys when they are numeric-invalid', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId);
    await seedIndex(pg.handle.db, repo.id, {
      files: [{ path: 'src/a.ts', pagerank: 1 }],
      stats: { totalCandidates: 'many', bounded: -3 },
    });
    expect(await svc().getOnboardingIndexStats(repo.id)).toMatchObject({
      totalCandidates: null,
      bounded: null,
    });
  });
});
