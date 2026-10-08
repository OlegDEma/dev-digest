import { describe, it, expect, vi } from 'vitest';
import { PrBlastResponse } from '@devdigest/shared';
import { NotFoundError } from '../src/platform/errors.js';
import { loadConfig } from '../src/platform/config.js';

let behaviour: () => Promise<unknown> = async () => ({});
vi.mock('../src/modules/blast/service.js', () => ({
  BlastService: class {
    get = () => behaviour();
  },
}));

const { buildApp } = await import('../src/app.js');
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const stubAuth = {
  currentUser: async () => ({ id: 'u1' }),
  currentWorkspace: async () => ({ id: 'w1' }),
} as never;

const valid = {
  changed_symbols: [{ name: 'a', file: 'd.ts', kind: 'function' }],
  downstream: [{ symbol: 'a', callers: [], endpoints_affected: [], crons_affected: [] }],
  summary: '1 changed symbol, no downstream callers found.',
  counts: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
  degraded: false,
  reason: null,
  index_sha: 'abc',
  max_callers_per_symbol: 20,
  facts_by_file: {},
};
const id = '11111111-1111-4111-8111-111111111111';

describe('GET /pulls/:id/blast', () => {
  

  it('200 with a body that parses as PrBlastResponse', async () => {
    behaviour = async () => valid;
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/blast` });
    expect(res.statusCode).toBe(200);
    expect(() => PrBlastResponse.parse(res.json())).not.toThrow();
    await app.close();
  });

  it('malformed service output -> 500 (response validation)', async () => {
    behaviour = async () => ({ ...valid, degraded: true, reason: 'FLAG_OFF' });
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/blast` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('NotFoundError -> 404', async () => {
    behaviour = async () => {
      throw new NotFoundError('Pull request not found');
    };
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/blast` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
