import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { DigestHealth, WeeklyDigest } from '../contracts/digests.js';
import type { Container } from '../platform/container.js';
import * as t from '../db/schema.js';
import { listRunsForPull } from '../reviews/repository/run.repo.js';

type DigestRow = typeof t.weeklyDigests.$inferSelect;

function toDto(row: DigestRow): WeeklyDigest {
  return {
    id: row.id,
    repo_id: row.repoId,
    from: row.fromDate.toISOString(),
    to: row.toDate.toISOString(),
    summary: row.summary,
    health: row.health as DigestHealth,
    cost_usd: row.costUsd,
    created_at: row.createdAt.toISOString(),
  };
}

export class DigestRepository {
  constructor(private container: Container) {}

  private get db() {
    return this.container.db;
  }

  async repoExists(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return !!row;
  }

  async listDigests(workspaceId: string, repoId: string): Promise<WeeklyDigest[]> {
    const rows = await this.db
      .select()
      .from(t.weeklyDigests)
      .where(and(eq(t.weeklyDigests.workspaceId, workspaceId), eq(t.weeklyDigests.repoId, repoId)))
      .orderBy(desc(t.weeklyDigests.createdAt));
    return rows.map(toDto);
  }

  async buildAndSaveDigest(
    workspaceId: string,
    repoId: string,
    from: Date,
    to: Date,
  ): Promise<WeeklyDigest> {
    const pulls = await this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          gte(t.pullRequests.updatedAt, from),
          lte(t.pullRequests.updatedAt, to),
        ),
      );

    let critical = 0;
    let costUsd = 0;
    const lines: string[] = [];
    for (const pull of pulls) {
      const runs = await listRunsForPull(this.db, workspaceId, pull.id);
      for (const run of runs) {
        costUsd += run.costUsd ?? 0;
        critical += run.findingsBySeverity?.CRITICAL ?? 0;
      }
      lines.push(`#${pull.number} ${pull.title} — ${runs.length} run(s)`);
    }

    const health: DigestHealth = critical === 0 ? 'green' : critical <= 3 ? 'amber' : 'red';

    const llm = await this.container.llm('openai');
    const completion = await llm.complete({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize this week of code review activity in 3 sentences.' },
        { role: 'user', content: lines.join('\n') },
      ],
    });

    const [row] = await this.db
      .insert(t.weeklyDigests)
      .values({
        workspaceId,
        repoId,
        fromDate: from,
        toDate: to,
        summary: completion.text,
        health,
        costUsd,
      })
      .returning();
    return toDto(row!);
  }
}
