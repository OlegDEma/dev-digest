// server/src/modules/pulls/service.ts
import { eq } from 'drizzle-orm';
import { Octokit } from '@octokit/rest';
import { db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class PullsService {
  async refresh(workspaceId: string, repoId: string) {
    const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [repo] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
    const { data } = await gh.pulls.list({ owner: repo.owner, repo: repo.name });
    for (const p of data) {
      await db.insert(t.pullRequests).values({ repoId, number: p.number, title: p.title }).onConflictDoNothing();
    }
    return data.length;
  }
}
