import { and, eq } from 'drizzle-orm';
import type { Severity } from '../../contracts/findings.js';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface ReviewForNotification {
  repoId: string;
  owner: string;
  repoName: string;
  prNumber: number;
  findings: { severity: Severity }[];
}

export async function reviewForNotification(
  db: Db,
  workspaceId: string,
  reviewId: string,
): Promise<ReviewForNotification | undefined> {
  const [review] = await db
    .select({
      repoId: t.pullRequests.repoId,
      owner: t.repos.owner,
      repoName: t.repos.name,
      prNumber: t.pullRequests.number,
    })
    .from(t.reviews)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
    .where(and(eq(t.reviews.id, reviewId), eq(t.reviews.workspaceId, workspaceId)));
  if (!review) return undefined;
  const rows = await db
    .select({ severity: t.findings.severity })
    .from(t.findings)
    .where(eq(t.findings.reviewId, reviewId));
  return { ...review, findings: rows as { severity: Severity }[] };
}
