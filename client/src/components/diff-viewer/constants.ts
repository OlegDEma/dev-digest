/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** How long a deep-linked line stays highlighted (AC-53: at least 1.5 s). */
export const FOCUS_FLASH_MS = 1600;

/** Delay after a deep-linked card opens, so its lines are mounted before we look them up. */
export const FOCUS_SETTLE_MS = 60;
