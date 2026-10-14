export { DEFAULT_PROJECT_CONTEXT_BUCKETS as DEFAULT_BUCKETS } from '../../platform/config.js';
export { MAX_DOC_BYTES } from '../_shared/doc-path.js';

/** Discovery lists at most this many documents (`truncated` beyond it). */
export const DISCOVERY_CAP = 2000;

/** Folders never descended into during discovery. */
export const EXCLUDED_DOC_DIRS: readonly string[] = ['node_modules', 'vendor', 'dist', '.git'];

/** Max entries in the discovery-only token-estimate cache. */
export const ESTIMATE_CACHE_MAX = 20_000;
