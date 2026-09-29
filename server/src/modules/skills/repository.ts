import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION, MANUAL_SOURCE, STATS_WINDOW_DAYS } from './constants.js';
import { isSkillConfigChange, type SkillRunMetrics } from './helpers.js';

/**
 * Skills data-access — the ONLY layer of this module touching the DB. Owns
 * `skills` and `skill_versions`; reads `agent_skills` for the "used by" counts
 * (the agents repository owns the write side of that link table). Workspace-
 * scoped throughout: every read and write is filtered by `workspace_id`.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** Paths the skill's content is grounded in (conventions extractor). */
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /** Every skill in the workspace, name ascending. */
  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  /** skill_id → number of agents binding it (skills with no links are absent). */
  async usedByCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.n]));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source ?? MANUAL_SOURCE,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        ...(values.evidenceFiles !== undefined ? { evidenceFiles: values.evidenceFiles } : {}),
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. A content change (name/description/type/body) bumps the
   * version and snapshots the new body into skill_versions; toggling `enabled`
   * alone does not.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const configChanged = isSkillConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /** Delete a skill (scoped). agent_skills + skill_versions cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Agents (id + name) that bind a skill, name ascending. */
  async agentsUsing(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));
  }

  // ---- stats (specs/03-skills.md §10.3) -------------------------------------
  // Attribution comes from `agent_run_skills` (written by the review executor);
  // this module only reads it. Window = last STATS_WINDOW_DAYS days, done runs.

  /** Done runs in the window across the whole workspace — the pull-rate denominator. */
  async runsInWindow(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, windowStart()),
        ),
      );
    return row?.n ?? 0;
  }

  /**
   * Per-skill counters in the window: runs that included the skill, and the
   * findings those runs produced (+ how many were accepted / dismissed). One
   * grouped query for the whole workspace, or narrowed to one skill.
   */
  async runMetrics(workspaceId: string, skillId?: string): Promise<Map<string, SkillRunMetrics>> {
    const rows = await this.db
      .select({
        skillId: t.agentRunSkills.skillId,
        runs: sql<number>`count(distinct ${t.agentRunSkills.runId})::int`,
        findings: sql<number>`count(${t.findings.id})::int`,
        accepted: sql<number>`count(${t.findings.id}) filter (where ${t.findings.acceptedAt} is not null)::int`,
        dismissed: sql<number>`count(${t.findings.id}) filter (where ${t.findings.dismissedAt} is not null)::int`,
      })
      .from(t.agentRunSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.agentRunSkills.runId))
      .leftJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.kind, 'review')))
      .leftJoin(t.findings, and(eq(t.findings.reviewId, t.reviews.id), eq(t.findings.kind, 'finding')))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, windowStart()),
          ...(skillId ? [eq(t.agentRunSkills.skillId, skillId)] : []),
        ),
      )
      .groupBy(t.agentRunSkills.skillId);
    return new Map(
      rows.map((r) => [
        r.skillId,
        { runs: r.runs, findings: r.findings, accepted: r.accepted, dismissed: r.dismissed },
      ]),
    );
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  private async snapshotVersion(row: SkillRow, version: number): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }
}

/** Start of the stats window (now − STATS_WINDOW_DAYS), compared against `agent_runs.ran_at`. */
function windowStart(): Date {
  return new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
