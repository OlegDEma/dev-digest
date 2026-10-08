import type { ActiveRun, Agent, ConventionCandidate, PrBlastResponse, PrMeta, Repo, ReviewRunResponse, RunDetail, RunRequest } from '@devdigest/shared';
import { ApiError } from '../errors.js';
import type { DevDigestApi } from './port.js';

const REQUEST_TIMEOUT_MS = 15_000;

/** Fetch adapter over the running DevDigest API. The only network access in `mcp/`. */
export class HttpDevDigestApi implements DevDigestApi {
  constructor(private readonly apiUrl: string) {}

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; signal?: AbortSignal | undefined } = {},
  ): Promise<T> {
    const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
    if (opts.signal) signals.push(opts.signal);
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
        body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      throw new ApiError(null, 'unreachable', err instanceof Error ? err.message : String(err));
    }
    if (!res.ok) throw await toApiError(res);
    try {
      return (await res.json()) as T;
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      throw new ApiError(res.status, 'bad_response', 'response was not valid JSON');
    }
  }

  listRepos(): Promise<Repo[]> {
    return this.request('GET', '/repos');
  }
  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
  }
  listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents');
  }
  activeRuns(prId: string): Promise<ActiveRun[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/runs/active`);
  }
  startReview(prId: string, body: RunRequest): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${encodeURIComponent(prId)}/review`, { body });
  }
  getRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
    return this.request('GET', `/runs/${encodeURIComponent(runId)}`, { signal });
  }
  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/conventions`);
  }
  getBlast(prId: string): Promise<PrBlastResponse> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/blast`);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (typeof body.error?.message === 'string') message = body.error.message;
  } catch {
    // non-JSON error body: keep the status text
  }
  return new ApiError(res.status, code, message);
}
