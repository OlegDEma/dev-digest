import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Findings-on-the-list — DB-backed coverage for the pulls list route's
 * `findings_by_severity` breakdown. The rule (spec 02, §3): a PR's current
 * findings are the UNION of the latest `review` per agent, counting only
 * non-dismissed findings by severity. `summary` reviews and older reviews of the
 * same agent are excluded; a PR with no such findings returns null → "—".
 * (The chips/hover rendering + the client grouping live in the client suite.)
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

let repoSeq = 0;
async function setupPr(db: Db, workspaceId: string) {
  const name = `findings-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1, // non-zero so the list route never triggers a detail backfill
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function makeAgent(db: Db, workspaceId: string, name: string) {
  const [a] = await db
    .insert(t.agents)
    .values({ workspaceId, name, provider: 'openrouter', model: 'm', systemPrompt: 's' })
    .returning();
  return a!;
}

async function addReview(
  db: Db,
  v: {
    workspaceId: string;
    prId: string;
    agentId: string;
    kind?: 'summary' | 'review';
    createdAt: Date;
  },
) {
  const [rv] = await db
    .insert(t.reviews)
    .values({
      workspaceId: v.workspaceId,
      prId: v.prId,
      agentId: v.agentId,
      runId: null,
      kind: v.kind ?? 'review',
      verdict: null,
      summary: null,
      score: null,
      model: 'm',
      createdAt: v.createdAt,
    })
    .returning();
  return rv!;
}

async function addFinding(
  db: Db,
  reviewId: string,
  severity: string,
  opts: { dismissed?: boolean } = {},
) {
  await db.insert(t.findings).values({
    reviewId,
    file: 'src/x.ts',
    startLine: 1,
    endLine: 1,
    severity,
    category: 'bug',
    title: 'a finding',
    rationale: 'because',
    confidence: 0.9,
    kind: 'finding',
    dismissedAt: opts.dismissed ? new Date() : null,
  });
}

type ListRow = {
  number: number;
  findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
};

d('PR-list findings breakdown (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function listRow(repoId: string): Promise<ListRow> {
    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    try {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
      expect(res.statusCode).toBe(200);
      return (res.json() as ListRow[]).find((p) => p.number === 482)!;
    } finally {
      await app.close();
    }
  }

  it('sums the latest review per agent; excludes older reviews, summaries and dismissed', async () => {
    const { repo, pr } = await setupPr(db, workspaceId);
    const [sec, perf] = await Promise.all([
      makeAgent(db, workspaceId, 'Security Reviewer'),
      makeAgent(db, workspaceId, 'Performance Reviewer'),
    ]);
    const base = new Date('2026-09-15T10:00:00Z');
    const at = (mins: number) => new Date(base.getTime() + mins * 60_000);

    // Security: an OLDER review (ignored) + a NEWER review that counts.
    const secOld = await addReview(db, { workspaceId, prId: pr.id, agentId: sec.id, createdAt: at(0) });
    await addFinding(db, secOld.id, 'CRITICAL'); // stale — must NOT count
    const secNew = await addReview(db, { workspaceId, prId: pr.id, agentId: sec.id, createdAt: at(10) });
    await addFinding(db, secNew.id, 'CRITICAL');
    await addFinding(db, secNew.id, 'WARNING');
    await addFinding(db, secNew.id, 'SUGGESTION', { dismissed: true }); // dismissed — excluded

    // Performance: a single review (additive across agents).
    const perfRev = await addReview(db, { workspaceId, prId: pr.id, agentId: perf.id, createdAt: at(10) });
    await addFinding(db, perfRev.id, 'WARNING');
    await addFinding(db, perfRev.id, 'SUGGESTION');

    // A newer 'summary' review with a finding — must be ignored (kind != review).
    const summ = await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: perf.id,
      kind: 'summary',
      createdAt: at(20),
    });
    await addFinding(db, summ.id, 'CRITICAL');

    const row = await listRow(repo.id);
    // sec latest: 1 CRITICAL + 1 WARNING (SUGGESTION dismissed). perf: 1 WARNING + 1 SUGGESTION.
    expect(row.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
  });

  it('is null when the PR has no (non-dismissed) findings', async () => {
    const { repo, pr } = await setupPr(db, workspaceId);
    const agent = await makeAgent(db, workspaceId, 'Security Reviewer');
    // A review whose only finding is dismissed → no current findings → null.
    const rev = await addReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      createdAt: new Date('2026-09-15T10:00:00Z'),
    });
    await addFinding(db, rev.id, 'CRITICAL', { dismissed: true });

    const row = await listRow(repo.id);
    expect(row.findings_by_severity).toBeNull();
  });

  it('is null for a PR with no reviews at all', async () => {
    const { repo } = await setupPr(db, workspaceId);
    const row = await listRow(repo.id);
    expect(row.findings_by_severity).toBeNull();
  });
});
