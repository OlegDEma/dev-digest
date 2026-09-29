import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract a repo's house rules and turn them into a skill.
 *   GET    /repos/:id/conventions          → candidates for the repo
 *   POST   /repos/:id/conventions/extract  → scan (one model call), persists survivors
 *   POST   /repos/:id/conventions/skill    → skill DRAFT from accepted (persists NOTHING)
 *   PATCH  /conventions/:id                → accept / reject / edit
 *   DELETE /conventions/:id                → drop a candidate
 *
 * Persisting the drafted skill stays on the skills module (`POST /skills`), and
 * binding it to an agent stays on the agents module (`POST /agents/:id/skills`).
 * See specs/04-conventions.md.
 */

const UpdateConventionBody = z
  .object({
    rule: z.string().trim().min(1).max(500).optional(),
    rationale: z.string().trim().max(1000).nullable().optional(),
    category: ConventionCategory.optional(),
    status: ConventionStatus.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  // A scan costs a model call, so it is a POST and is rate-limited more tightly
  // than the default 120/min.
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.remove(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return reply.code(204).send();
  });
}
