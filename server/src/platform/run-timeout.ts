import ms from 'ms';

/** Default wall-clock budget for one agent run. */
export const DEFAULT_RUN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Parses a human-readable run timeout (`"90s"`, `"5m"`, `"1h"`) from the
 * `RUN_TIMEOUT` env var into milliseconds. Empty input falls back to the default.
 */
export function parseRunTimeout(input: string | undefined): number {
  if (!input) return DEFAULT_RUN_TIMEOUT_MS;
  return ms(input);
}
