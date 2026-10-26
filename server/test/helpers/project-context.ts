import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

/** Create a temp "clone" with the given relative files. */
export async function makeClone(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pc-clone-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

let seq = 0;
/** Insert a repo (optionally with a clone path) and a PR with one patched file. */
export async function insertRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { clonePath?: string | null; owner?: string; file?: { path: string; patch: string } } = {},
) {
  const name = `pc-repo-${Date.now()}-${seq++}`;
  const owner = opts.owner ?? 'acme';
  const [repo] = await db
    .insert(t.repos)
    .values({
      workspaceId,
      owner,
      name,
      fullName: `${owner}/${name}`,
      clonePath: opts.clonePath ?? null,
    })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Change',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: `sha${seq}`,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'body',
    })
    .returning();
  const file = opts.file ?? {
    path: 'src/config.ts',
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  };
  await db.insert(t.prFiles).values({ prId: pr!.id, path: file.path, additions: 1, deletions: 0, patch: file.patch });
  return { repo: repo!, pr: pr! };
}
