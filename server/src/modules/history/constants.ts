/** Caps for the Prior PRs lookup (worst case ≈ MAX_FILES + MAX_COMMITS GitHub calls per uncached PR). */
export const MAX_FILES = 10;
export const PER_FILE_COMMITS = 20;
export const MAX_COMMITS = 30;
export const MAX_PRIOR_PRS = 5;

/** One overall budget for the whole GitHub fan-out of a single history request. */
export const DEADLINE_MS = 12_000;
/** Concurrent PR lookups (the commit listing stays sequential). */
export const LOOKUP_CONCURRENCY = 3;

export const CACHE_TTL_MS = 15 * 60_000;
/** A failed lookup (`github_error`) is remembered briefly so a bad token is not hammered. */
export const FAILURE_TTL_MS = 60_000;
export const CACHE_MAX = 200;
