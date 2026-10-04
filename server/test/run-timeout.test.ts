import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN_TIMEOUT_MS, parseRunTimeout } from '../src/platform/run-timeout.js';

describe('parseRunTimeout', () => {
  it('falls back to the default for empty input', () => {
    expect(parseRunTimeout(undefined)).toBe(DEFAULT_RUN_TIMEOUT_MS);
    expect(parseRunTimeout('')).toBe(DEFAULT_RUN_TIMEOUT_MS);
  });

  it('parses human-readable durations', () => {
    expect(parseRunTimeout('90s')).toBe(90_000);
    expect(parseRunTimeout('5m')).toBe(300_000);
  });
});
