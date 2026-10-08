/** Caps for the Prior PRs lookup (worst case ≈ MAX_FILES + MAX_COMMITS GitHub calls per uncached PR). */
export const MAX_FILES = 10;
export const PER_FILE_COMMITS = 20;
export const MAX_COMMITS = 30;
export const MAX_PRIOR_PRS = 5;

export const CACHE_TTL_MS = 15 * 60_000;
export const CACHE_MAX = 200;
