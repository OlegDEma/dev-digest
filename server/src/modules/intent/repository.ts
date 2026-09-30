import type { PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as intentRepo from './repository/intent.repo.js';

/** Sole owner of the `pr_intent` table. */
export class IntentRepository {
  constructor(private readonly db: Db) {}

  get(prId: string): Promise<PrIntentRecord | undefined> {
    return intentRepo.getIntent(this.db, prId);
  }

  upsert(record: PrIntentRecord): Promise<void> {
    return intentRepo.upsertIntent(this.db, record);
  }
}
