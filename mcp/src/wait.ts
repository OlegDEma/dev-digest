import type { RunDetail } from '@devdigest/shared';
import type { DevDigestApi } from './api/port.js';
import { ToolFailure } from './errors.js';
import { lostContact } from './texts.js';

export interface WaitOpts {
  waitSec: number;
  pollMs: number;
  signal?: AbortSignal | undefined;
  onTick?: ((elapsedSec: number, waitSec: number) => void) | undefined;
}

const MAX_CONSECUTIVE_FAILURES = 3;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('aborted');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll `GET /runs/:id` until the run leaves `running` or `waitSec` passes.
 * Abort stops polling and throws; it never cancels the server run.
 */
export async function waitForRun(
  api: DevDigestApi,
  runId: string,
  { waitSec, pollMs, signal, onTick }: WaitOpts,
): Promise<RunDetail | { timedOut: true }> {
  if (waitSec <= 0) return { timedOut: true };
  const waitMs = waitSec * 1000;
  let elapsedMs = 0;
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw abortReason(signal);
    try {
      const detail = await api.getRun(runId, signal);
      failures = 0;
      if (detail.status !== 'running') return detail;
    } catch (err) {
      if (signal?.aborted || err instanceof ToolFailure) throw err;
      failures += 1;
      if (failures > MAX_CONSECUTIVE_FAILURES) throw new ToolFailure(lostContact(runId));
    }
    if (elapsedMs >= waitMs) return { timedOut: true };
    onTick?.(elapsedMs / 1000, waitSec);
    const step = Math.min(pollMs, waitMs - elapsedMs);
    await sleep(step, signal);
    elapsedMs += step;
  }
}
