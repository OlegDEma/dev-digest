import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { OnboardingLastFailure, OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** The jsonb stored in `onboarding.json` (D2). An unparseable row reads as "no tour". */
const StoredSchema = z.object({
  v: z.literal(1),
  tour: OnboardingTour,
  last_failure: OnboardingLastFailure.nullable(),
});
export type StoredTour = z.infer<typeof StoredSchema>;

/**
 * Onboarding data access: the stored tour (`onboarding`) and the DB-backed
 * generation lock (`onboarding_generation_lock`). The lock clock is the DB's
 * `now()` in every statement, never the Node clock (D4).
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async getStored(repoId: string): Promise<StoredTour | null> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = StoredSchema.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  /** The only write path for a replace: stores `last_failure: null` (AC-78). */
  async replaceTour(repoId: string, tour: OnboardingTour): Promise<void> {
    const json: StoredTour = { v: 1, tour, last_failure: null };
    const generatedAt = new Date(tour.generated_at);
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } });
  }

  /** Keep the stored tour; overwrite only `json.last_failure` (AC-36, AC-75). */
  async keepTourSetFailure(repoId: string, lastFailure: OnboardingLastFailure): Promise<void> {
    await this.db
      .update(t.onboarding)
      .set({
        json: sql`jsonb_set(${t.onboarding.json}, '{last_failure}', ${JSON.stringify(lastFailure)}::jsonb)`,
      })
      .where(eq(t.onboarding.repoId, repoId));
  }

  /** One atomic statement: insert, or take over a lock older than the TTL. True = acquired. */
  async tryAcquireLock(repoId: string, lockId: string, ttlMs: number): Promise<boolean> {
    const rows = await this.db
      .insert(t.onboardingGenerationLock)
      .values({ repoId, lockId })
      .onConflictDoUpdate({
        target: t.onboardingGenerationLock.repoId,
        set: { lockId, startedAt: sql`now()` },
        setWhere: sql`${t.onboardingGenerationLock.startedAt} < now() - (${ttlMs}::double precision * interval '1 millisecond')`,
      })
      .returning({ lockId: t.onboardingGenerationLock.lockId });
    return rows.length > 0;
  }

  /** Only deletes our own lock: a late-finishing old generation cannot free a newer one. */
  async releaseLock(repoId: string, lockId: string): Promise<void> {
    await this.db
      .delete(t.onboardingGenerationLock)
      .where(sql`${t.onboardingGenerationLock.repoId} = ${repoId} AND ${t.onboardingGenerationLock.lockId} = ${lockId}`);
  }

  async isLocked(repoId: string, ttlMs: number): Promise<boolean> {
    const rows = await this.db
      .select({ repoId: t.onboardingGenerationLock.repoId })
      .from(t.onboardingGenerationLock)
      .where(
        sql`${t.onboardingGenerationLock.repoId} = ${repoId} AND ${t.onboardingGenerationLock.startedAt} >= now() - (${ttlMs}::double precision * interval '1 millisecond')`,
      );
    return rows.length > 0;
  }
}
