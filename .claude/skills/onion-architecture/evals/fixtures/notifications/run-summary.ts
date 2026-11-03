import type { Db } from '../db/client.js';
import { listRunsForPull } from '../reviews/index.js';

export interface RunSummary {
  runs: number;
  costUsd: number;
}

export async function summarizeRunsForPull(db: Db, workspaceId: string, prId: string): Promise<RunSummary> {
  const runs = await listRunsForPull(db, workspaceId, prId);
  return {
    runs: runs.length,
    costUsd: runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
  };
}
