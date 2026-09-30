import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module — the PR's derived intent (see specs/08-intent-layer.md).
 *   GET  /pulls/:id/intent  → stored intent (null when none) + stale flag
 *   POST /pulls/:id/intent  → (re)derive on the cheap `review_intent` model
 * Recompute is an explicit mutation and costs a model call — never on mount.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.recompute(workspaceId, req.params.id, req.log);
    },
  );
}
