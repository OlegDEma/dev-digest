import { describe, it, expect } from 'vitest';
import { nextRetryDelayMs, shouldRetry } from '../src/modules/_shared/retry-budget.js';

describe('retry budget', () => {
  it('backs off exponentially', () => {
    expect(nextRetryDelayMs(1)).toBe(500);
    expect(nextRetryDelayMs(2)).toBe(1000);
    expect(nextRetryDelayMs(3)).toBe(2000);
  });

  it('allows a retry while under the limit', () => {
    expect(shouldRetry(1, 3)).toBe(true);
  });
});
