import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WeeklyDigestRequest } from '../contracts/digests.js';
import { IdParams } from '../shared/schemas.js';
import { startWeeklyDigestScheduler } from './scheduler.js';
import { DigestService } from './service.js';

/**
 * Digests module — a weekly summary of review activity for a repo.
 *   POST /repos/:id/digests      → generate a digest for a date window
 *   GET  /repos/:id/digests      → list generated digests
 */
export default async function digestsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DigestService(app.container);
  startWeeklyDigestScheduler(app.container);

  app.post(
    '/repos/:id/digests',
    { schema: { params: IdParams, body: WeeklyDigestRequest } },
    async (req, reply) => service.generate(req, reply),
  );

  app.get('/repos/:id/digests', { schema: { params: IdParams } }, async (req, reply) =>
    service.list(req, reply),
  );
}
