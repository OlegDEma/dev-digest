import { eq } from 'drizzle-orm';
import { IntentConfidence, type PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

/**
 * `pr_intent` data access. Deliberate name mismatch: the contract field
 * `summary` is stored in the pre-existing `intent` column (renaming would make
 * drizzle-kit generate interactive).
 */
export async function upsertIntent(db: Db, record: PrIntentRecord): Promise<void> {
  const values = {
    intent: record.summary,
    inScope: record.in_scope,
    outOfScope: record.out_of_scope,
    riskAreas: record.risk_areas,
    missingContext: record.missing_context,
    confidence: record.confidence,
    sources: record.sources,
    model: record.model,
    headSha: record.head_sha,
    tokensIn: record.tokens_in,
    tokensOut: record.tokens_out,
    costUsd: record.cost_usd,
    diffTokensSaved: record.diff_tokens_saved,
    computedAt: new Date(record.computed_at),
  };
  await db
    .insert(t.prIntent)
    .values({ prId: record.pr_id, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: row.prId,
    summary: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas as PrIntentRecord['risk_areas'],
    missing_context: row.missingContext,
    confidence: IntentConfidence.catch('low').parse(row.confidence),
    sources: row.sources as PrIntentRecord['sources'],
    model: row.model,
    head_sha: row.headSha,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    diff_tokens_saved: row.diffTokensSaved,
    computed_at: row.computedAt.toISOString(),
  };
}
