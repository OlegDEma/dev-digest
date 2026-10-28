import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingTourResponse } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding Tour module.
 *   GET  /repos/:id/onboarding           -> stored tour (never generates)
 *   POST /repos/:id/onboarding/generate  -> generate / regenerate (one LLM call at most)
 * Errors use the shared envelope: repo_not_found 404, generation_in_progress 409, rate_limited 429.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.read(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 200: OnboardingTourResponse } },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          errorResponseBuilder: (_req, ctx) =>
            new AppError('rate_limited', `Rate limit exceeded, retry in ${ctx.after}`, ctx.statusCode, {
              retry_after: ctx.after,
            }),
        },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
