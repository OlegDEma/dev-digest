import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi } from '../src/api/http.js';
import { loadConfig } from '../src/config.js';
import { ApiError, toToolError } from '../src/errors.js';
import { RATE_LIMITED, unreachable } from '../src/texts.js';

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const textOf = (r: ReturnType<typeof toToolError>): string => {
  const c = r.content[0];
  return c && c.type === 'text' ? c.text : '';
};

describe('HttpDevDigestApi + toToolError', () => {
  it('unreachable -> text contains the configured url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const api = new HttpDevDigestApi('http://example.test:9');
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const res = toToolError(err, 'http://example.test:9');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(unreachable('http://example.test:9'));
    expect(textOf(res)).toContain('http://example.test:9');
  });

  it('429 -> rate-limited text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(429, { error: { code: 'rate_limited', message: 'x' } })));
    const err = await new HttpDevDigestApi('http://a').startReview('p', {}).catch((e: unknown) => e);
    expect(textOf(toToolError(err, 'http://a'))).toBe(RATE_LIMITED);
  });

  it('404 -> API error text with status, code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { error: { code: 'not_found', message: 'Run missing' } })));
    const err = await new HttpDevDigestApi('http://a').getRun('r').catch((e: unknown) => e);
    expect(textOf(toToolError(err, 'http://a'))).toBe('DevDigest API error 404 not_found: Run missing');
  });

  it('requests go to the configured base url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, []));
    vi.stubGlobal('fetch', fetchMock);
    await new HttpDevDigestApi('http://api.test:1234').listRepos();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test:1234/repos');
  });

  it('an unknown error maps to a 500 internal text', () => {
    expect(textOf(toToolError(new Error('boom'), 'http://a'))).toBe('DevDigest API error 500 internal: boom');
  });
});

describe('loadConfig', () => {
  it('honours DEVDIGEST_API_URL and strips trailing slashes', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://x:1//' }).apiUrl).toBe('http://x:1');
    expect(loadConfig({}).apiUrl).toBe('http://localhost:3001');
  });

  it.each([
    ['-5', 0],
    ['5000', 900],
    ['abc', 120],
    [undefined, 120],
    ['0', 0],
    ['60', 60],
  ])('wait %s -> %s', (raw, expected) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(loadConfig({ DEVDIGEST_MCP_RUN_WAIT_SEC: raw }).runWaitSec).toBe(expected);
    stderr.mockRestore();
  });
});
