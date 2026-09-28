import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Data access for the `conventions` table — the only layer here that touches
 * Drizzle. Everything above works on rows and DTOs.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type InsertConvention = typeof t.conventions.$inferInsert;

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Newest first, so a fresh scan surfaces at the top of the board. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async listByStatus(workspaceId: string, repoId: string, statuses: ConventionRow['status'][]) {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, statuses),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  /**
   * A re-scan replaces ONLY the pending rows. Accepted and rejected candidates
   * are the user's decisions and survive every subsequent scan — that is what
   * stops a rejected rule from coming back forever (spec D5).
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: Omit<InsertConvention, 'workspaceId' | 'repoId'>[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(rows.map((r) => ({ ...r, workspaceId, repoId })))
        .returning();
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<ConventionRow, 'rule' | 'rationale' | 'category' | 'status'>>,
  ): Promise<ConventionRow | undefined> {
    if (Object.keys(patch).length === 0) return this.getById(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
