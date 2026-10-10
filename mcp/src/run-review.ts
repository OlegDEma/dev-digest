import type { RunDetail } from '@devdigest/shared';
import type { DevDigestApi } from './api/port.js';
import { ApiError } from './errors.js';
import { waitForRun } from './wait.js';

export type ReviewOutcome =
  | { kind: 'done'; detail: RunDetail; attached: boolean }
  | { kind: 'failed' | 'cancelled'; detail: RunDetail }
  | { kind: 'running'; runId: string; agentName: string | null; attached: boolean };

export interface RunReviewOpts {
  signal?: AbortSignal | undefined;
  onTick?: ((elapsedSec: number, waitSec: number) => void) | undefined;
  waitSec: number;
  pollMs: number;
}

/** attach-or-start → wait → outcome. No formatting, no MCP. */
export async function runReview(
  api: DevDigestApi,
  ids: { prId: string; agentId: string },
  { signal, onTick, waitSec, pollMs }: RunReviewOpts,
): Promise<ReviewOutcome> {
  // Agent-only match, no head-SHA check (D18, Q7).
  const active = (await api.activeRuns(ids.prId)).find((r) => r.agent_id === ids.agentId);
  let runId: string;
  let agentName: string | null;
  let attached = false;
  if (active) {
    runId = active.run_id;
    agentName = active.agent_name;
    attached = true;
  } else {
    const started = (await api.startReview(ids.prId, { agentId: ids.agentId })).runs[0];
    if (!started) throw new ApiError(500, 'internal', 'the API started no run');
    runId = started.run_id;
    agentName = started.agent_name;
  }

  const waited = await waitForRun(api, runId, { waitSec, pollMs, signal, onTick });
  if ('timedOut' in waited) return { kind: 'running', runId, agentName, attached };
  if (waited.status === 'done') return { kind: 'done', detail: waited, attached };
  return { kind: waited.status === 'cancelled' ? 'cancelled' : 'failed', detail: waited };
}

export function fetchRun(api: DevDigestApi, runId: string, signal?: AbortSignal): Promise<RunDetail> {
  return api.getRun(runId, signal);
}
