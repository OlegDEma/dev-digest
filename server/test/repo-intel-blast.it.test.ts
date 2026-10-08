/**
 * Spec 12 AR-1: a reference from the declaring file itself is excluded in SQL,
 * so it never takes one of the per-symbol cap slots.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('getBlastRadius(fallback:false): same-file reference takes no cap slot', () => {
  let pg: PgFixture;
  let repoId: string;
  let svc: RepoIntelService;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'blast', fullName: 'acme/blast' })
      .returning();
    repoId = r!.id;
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      status: 'full',
    });
    await db.insert(t.symbols).values({
      repoId,
      path: 'decl.ts',
      name: 'a',
      kind: 'function',
      line: 1,
      endLine: 2,
      exported: true,
    });
    const callerFiles = Array.from({ length: 25 }, (_, i) => `c${i}.ts`);
    await db.insert(t.fileRank).values(
      [...callerFiles, 'decl.ts'].map((filePath, i) => ({
        repoId,
        filePath,
        pagerank: 0.1,
        hotness: 0,
        // the declaring file ranks highest: without the SQL filter it would sort first
        rank: filePath === 'decl.ts' ? 10 : 1 - i / 100,
        percentile: 50,
      })),
    );
    await db.insert(t.references).values([
      { repoId, fromPath: 'decl.ts', toSymbol: 'a', line: 2, declFile: 'decl.ts' },
      ...callerFiles.map((fromPath) => ({ repoId, fromPath, toSymbol: 'a', line: 5, declFile: 'decl.ts' })),
    ]);
    svc = new RepoIntelService({
      config: { repoIntelEnabled: true },
      db,
      codeIndex: {} as never,
    } as never);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns exactly 20 of 25 cross-file callers (cut in SQL, flagged truncated) and none from the declaring file', async () => {
    const res = await svc.getBlastRadius(repoId, ['decl.ts'], { fallback: false });
    const a = res.callers.filter((c) => c.viaSymbol === 'a');
    expect(a).toHaveLength(20);
    expect(res.truncatedSymbols).toEqual(['a']);
    expect(a.some((c) => c.file === 'decl.ts')).toBe(false);
  });
});
