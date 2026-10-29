import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;
export type InsertCiRun = Omit<typeof t.ciRuns.$inferInsert, 'id'>;

export interface CiRunListRow {
  run: CiRunRow;
  agentName: string;
}

/** ci_installations / ci_runs data-access. Workspace scope comes from the owning agent. */
export class CiRepository {
  constructor(private db: Db) {}

  async insertInstallation(values: {
    agentId: string;
    repo: string;
    targetType: CiInstallationRow['targetType'];
  }): Promise<CiInstallationRow> {
    // Idempotent per (agent, repo, target): a republish refreshes installed_at.
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values(values)
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo, t.ciInstallations.targetType],
        set: { installedAt: new Date() },
      })
      .returning();
    return row!;
  }

  /** Newest first. The agent is already workspace-checked by the caller. */
  async listInstallations(agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(desc(t.ciInstallations.installedAt));
  }

  async installationsForWorkspace(workspaceId: string): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map((r) => r.inst);
  }

  /** Which of `ids` are already stored (cheap pre-filter before downloading artifacts). */
  async existingGithubRunIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.ciRuns.githubRunId })
      .from(t.ciRuns)
      .where(inArray(t.ciRuns.githubRunId, ids));
    return new Set(rows.map((r) => r.id).filter((id): id is string => id != null));
  }

  /** Insert unless the GitHub run id is already there. True when a row was added. */
  async insertCiRunIfNew(values: InsertCiRun): Promise<boolean> {
    const rows = await this.db
      .insert(t.ciRuns)
      .values(values)
      .onConflictDoNothing({ target: t.ciRuns.githubRunId })
      .returning({ id: t.ciRuns.id });
    return rows.length > 0;
  }

  /** Newest first; only runs whose installation's agent belongs to the workspace. */
  async listRuns(workspaceId: string, limit: number): Promise<CiRunListRow[]> {
    const rows = await this.db
      .select({ run: t.ciRuns, agentName: t.agents.name })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId)))
      .orderBy(sql`${t.ciRuns.ranAt} desc nulls last`, desc(t.ciRuns.id))
      .limit(limit);
    return rows;
  }
}
