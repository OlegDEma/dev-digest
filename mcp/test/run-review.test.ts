import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ToolFailure } from '../src/errors.js';
import { runReview } from '../src/run-review.js';
import { lostContact } from '../src/texts.js';
import {
  AGENT_ID,
  DISABLED_AGENT_ID,
  FakeApi,
  PR_ID,
  RUN_ID,
  runDetail,
  runningDetail,
} from './fake-api.js';

const ids = { prId: PR_ID, agentId: AGENT_ID };
const POLL = 5000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('runReview', () => {
  it('(a) done at poll 3 -> done, getRun x3', async () => {
    const api = new FakeApi();
    api.runs = [runningDetail(), runningDetail(), runDetail()];
    const p = runReview(api, ids, { waitSec: 120, pollMs: POLL });
    await vi.advanceTimersByTimeAsync(POLL * 2);
    const out = await p;
    expect(out.kind).toBe('done');
    expect(api.count('getRun')).toBe(3);
    expect(api.count('startReview')).toBe(1);
  });

  it('(b) still running past the cap -> running', async () => {
    const api = new FakeApi();
    const p = runReview(api, ids, { waitSec: 10, pollMs: POLL });
    await vi.advanceTimersByTimeAsync(POLL * 3);
    const out = await p;
    expect(out).toEqual({ kind: 'running', runId: RUN_ID, agentName: 'Security Reviewer', attached: false });
  });

  it('(c) failed -> failed with detail.error', async () => {
    const api = new FakeApi();
    api.runs = [runDetail({ status: 'failed', error: 'no key', review: null })];
    const out = await runReview(api, ids, { waitSec: 120, pollMs: POLL });
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') expect(out.detail.error).toBe('no key');
  });

  it('(d) abort mid-wait rejects, stops polling, never cancels', async () => {
    const api = new FakeApi();
    const ac = new AbortController();
    const p = runReview(api, ids, { waitSec: 120, pollMs: POLL, signal: ac.signal });
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(POLL);
    const before = api.count('getRun');
    ac.abort(new Error('client cancelled'));
    const err = await settled;
    expect((err as Error).message).toBe('client cancelled');
    await vi.advanceTimersByTimeAsync(POLL * 5);
    expect(api.count('getRun')).toBe(before);
    expect(api.calls.some((c) => /cancel/i.test(c))).toBe(false);
  });

  it('(e) onTick is called once per poll with (elapsed, waitSec)', async () => {
    const api = new FakeApi();
    api.runs = [runningDetail(), runningDetail(), runDetail()];
    const onTick = vi.fn();
    const p = runReview(api, ids, { waitSec: 120, pollMs: POLL, onTick });
    await vi.advanceTimersByTimeAsync(POLL * 2);
    await p;
    expect(onTick.mock.calls).toEqual([
      [0, 120],
      [5, 120],
    ]);
  });

  it('(f) attaches to an active run of the same agent; other agents start a new run', async () => {
    const api = new FakeApi();
    api.runs = [runDetail()];
    api.active = [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer', ran_at: null }];
    const out = await runReview(api, ids, { waitSec: 120, pollMs: POLL });
    expect(out).toMatchObject({ kind: 'done', attached: true });
    expect(api.count('startReview')).toBe(0);

    const api2 = new FakeApi();
    api2.runs = [runDetail()];
    api2.active = [{ run_id: 'other', agent_id: DISABLED_AGENT_ID, agent_name: 'x', ran_at: null }];
    const out2 = await runReview(api2, ids, { waitSec: 120, pollMs: POLL });
    expect(out2).toMatchObject({ kind: 'done', attached: false });
    expect(api2.count('startReview')).toBe(1);
  });

  it('(g) waitSec 0 -> running, getRun not called', async () => {
    const api = new FakeApi();
    const out = await runReview(api, ids, { waitSec: 0, pollMs: POLL });
    expect(out.kind).toBe('running');
    expect(api.count('getRun')).toBe(0);
    expect(api.count('startReview')).toBe(1);
  });

  it('(h) 3 transient failures then done -> done; 4 failures -> lost contact', async () => {
    const boom = new ApiError(429, 'rate_limited', 'slow down');
    const api = new FakeApi();
    api.runs = [boom, boom, boom, runDetail()];
    const p = runReview(api, ids, { waitSec: 120, pollMs: POLL });
    await vi.advanceTimersByTimeAsync(POLL * 3);
    expect((await p).kind).toBe('done');

    const api2 = new FakeApi();
    api2.runs = [boom];
    const p2 = runReview(api2, ids, { waitSec: 120, pollMs: POLL });
    const settled = p2.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(POLL * 4);
    const err = await settled;
    expect(err).toBeInstanceOf(ToolFailure);
    expect((err as ToolFailure).text).toBe(lostContact(RUN_ID));
    expect(api2.count('getRun')).toBe(4);
  });
});
