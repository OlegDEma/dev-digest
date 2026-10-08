import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistoryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { HistoryService } from './service.js';

/**
 * History module — prior merged PRs touching the same files (see specs/12-blast-radius.md).
 *   GET /pulls/:id/history → up to 5 PRs, or `available:false` when GitHub can't be asked
 * Calls GitHub, so it has its own tighter rate limit; the blast route stays index-only.
 */
export default async function historyRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new HistoryService(app.container);

  app.get(
    '/pulls/:id/history',
    {
      schema: { params: IdParams, response: { 200: PrHistoryResponse } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id, req.log);
    },
  );
}
