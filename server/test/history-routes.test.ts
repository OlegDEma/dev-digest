import { describe, it, expect, vi } from 'vitest';
import { PrHistoryResponse } from '@devdigest/shared';
import { NotFoundError } from '../src/platform/errors.js';
import { loadConfig } from '../src/platform/config.js';

let behaviour: () => Promise<unknown> = async () => ({});
vi.mock('../src/modules/history/service.js', () => ({
  HistoryService: class {
    get = () => behaviour();
  },
}));

const { buildApp } = await import('../src/app.js');
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const stubAuth = {
  currentUser: async () => ({ id: 'u1' }),
  currentWorkspace: async () => ({ id: 'w1' }),
} as never;

const valid = { history: [], available: false, reason: 'no_token' };
const id = '11111111-1111-4111-8111-111111111111';

describe('GET /pulls/:id/history', () => {
  

  it('200 with a body that parses as PrHistoryResponse', async () => {
    behaviour = async () => valid;
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/history` });
    expect(res.statusCode).toBe(200);
    expect(() => PrHistoryResponse.parse(res.json())).not.toThrow();
    await app.close();
  });

  it('malformed service output -> 500 (response validation)', async () => {
    behaviour = async () => ({ ...valid, reason: 'NO_TOKEN' });
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/history` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('NotFoundError -> 404', async () => {
    behaviour = async () => {
      throw new NotFoundError('Pull request not found');
    };
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/history` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('non-uuid id -> 422', async () => {
    const app = await buildApp({ config, overrides: { auth: stubAuth } });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/history' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
