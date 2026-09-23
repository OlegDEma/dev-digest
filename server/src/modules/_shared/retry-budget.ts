/**
 * Retry backoff shared by the job runner and the polling loop: exponential from
 * `baseMs`, doubling per attempt, clamped at `maxMs`.
 */
export function nextRetryDelayMs(attempt: number, baseMs = 500, maxMs = 30_000): number {
  if (!Number.isInteger(attempt)) throw new TypeError('attempt must be an integer');
  if (attempt < 0) throw new RangeError('attempt must be >= 0');
  if (attempt === 0) return 0;
  const delay = baseMs * 2 ** (attempt - 1);
  return delay > maxMs ? maxMs : delay;
}

/** Whether another retry is allowed within the budget. */
export function shouldRetry(attempt: number, maxAttempts: number): boolean {
  if (maxAttempts <= 0) return false;
  return attempt < maxAttempts;
}
