import { STALE_INDEX_AFTER_MS, type RepoIndexStatus } from '../repo-intel/index.js';

export function shouldSkipDigest(status: RepoIndexStatus, now: Date): boolean {
  if (status.state !== 'ready' || !status.lastIndexedAt) return true;
  return now.getTime() - status.lastIndexedAt.getTime() > STALE_INDEX_AFTER_MS;
}
