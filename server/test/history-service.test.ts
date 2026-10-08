import { describe, it, expect, vi } from 'vitest';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { HistoryService } from '../src/modules/history/service.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';

const rows = Array.from({ length: 7 }, (_, i) => ({
  number: i + 1,
  title: `pr ${i + 1}`,
  merged_at: i === 0 ? null : `2026-01-0${i + 1}T00:00:00Z`,
  author: 'a',
  path: 'a.ts',
}));

function setup(opts: { github?: () => Promise<unknown>; prFiles?: unknown[]; pull?: unknown } = {}) {
  const mock = new MockGitHubClient({ prsTouchingFiles: [...rows, { ...rows[1]!, number: 42 }] });
  const spy = vi.spyOn(mock, 'listPrsTouchingFiles');
  const github = opts.github ?? (async () => mock);
  const state = { pull: opts.pull === undefined ? { id: 'p', repoId: 'r', number: 42, headSha: 'h1' } : opts.pull };
  const reviews = {
    getPull: async () => state.pull,
    getPrFiles: async () => opts.prFiles ?? [{ path: 'a.ts', additions: 1, deletions: 1 }],
    getRepo: async () => ({ owner: 'acme', name: 'w' }),
  };
  const logs: unknown[] = [];
  const log = { info: (o: unknown) => void logs.push(o), warn: (o: unknown) => void logs.push(o) };
  const service = new HistoryService({ github } as never, reviews as never);
  return { service, spy, state, log };
}

describe('HistoryService.get', () => {
  it('returns <=5 merged PRs without the current one, and caches per head SHA', async () => {
    const t = setup();
    const a = await t.service.get('ws', 'p', t.log);
    expect(a.available).toBe(true);
    expect(a.history.length).toBeLessThanOrEqual(5);
    expect(a.history.some((h) => h.pr_number === 42 || h.pr_number === 1)).toBe(false);

    await t.service.get('ws', 'p', t.log);
    expect(t.spy).toHaveBeenCalledTimes(1);

    t.state.pull = { id: 'p', repoId: 'r', number: 42, headSha: 'h2' };
    await t.service.get('ws', 'p', t.log);
    expect(t.spy).toHaveBeenCalledTimes(2);
  });

  it('no token -> available:false, not cached', async () => {
    const github = vi.fn(async () => {
      throw new ConfigError('no token');
    });
    const t = setup({ github });
    expect(await t.service.get('ws', 'p', t.log)).toMatchObject({ available: false, reason: 'no_token', history: [] });
    await t.service.get('ws', 'p', t.log);
    expect(github).toHaveBeenCalledTimes(2);
  });

  it('port error -> github_error', async () => {
    const t = setup();
    t.spy.mockImplementation(async () => {
      throw new Error('boom');
    });
    expect(await t.service.get('ws', 'p', t.log)).toMatchObject({ available: false, reason: 'github_error' });
  });

  it('no pr_files -> empty and available, no port call', async () => {
    const t = setup({ prFiles: [] });
    expect(await t.service.get('ws', 'p', t.log)).toEqual({ history: [], available: true, reason: null });
    expect(t.spy).not.toHaveBeenCalled();
  });

  it('unknown PR -> NotFoundError', async () => {
    const t = setup({ pull: undefined as never });
    t.state.pull = undefined;
    await expect(t.service.get('ws', 'p', t.log)).rejects.toBeInstanceOf(NotFoundError);
  });
});
