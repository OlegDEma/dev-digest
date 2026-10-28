import type { DocumentStatus } from '@devdigest/shared';
import { ESTIMATE_CACHE_MAX } from './constants.js';

export interface CachedEstimate {
  status: DocumentStatus;
  tokens: number | null;
}

/** Cache key: a changed size or mtime is a different file version. */
export function estimateCacheKey(root: string, path: string, size: number, mtimeMs: number): string {
  return `${root}\0${path}\0${size}\0${mtimeMs}`;
}

/**
 * In-memory estimate cache for the discovery LISTING only. Run-time resolution
 * and document reads never consult it (AC-26: always a fresh read).
 */
export class EstimateCache {
  private map = new Map<string, CachedEstimate>();

  get(key: string): CachedEstimate | undefined {
    return this.map.get(key);
  }

  set(key: string, value: CachedEstimate): void {
    if (this.map.size >= ESTIMATE_CACHE_MAX) this.map.clear();
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }
}
