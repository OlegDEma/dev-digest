import type { Db } from '../../db/client.js';
import * as briefRepo from './repository/brief.repo.js';
import type { SpecAttachmentRow } from './repository/brief.repo.js';

export type { SpecAttachmentRow };

/** Sole owner of the `pr_brief` table. */
export class BriefRepository {
  constructor(private readonly db: Db) {}

  get(prId: string): Promise<unknown | undefined> {
    return briefRepo.getBriefJson(this.db, prId);
  }

  upsert(prId: string, json: unknown): Promise<void> {
    return briefRepo.upsertBrief(this.db, prId, json);
  }

  listSpecAttachments(workspaceId: string): Promise<SpecAttachmentRow[]> {
    return briefRepo.listSpecAttachments(this.db, workspaceId);
  }
}
