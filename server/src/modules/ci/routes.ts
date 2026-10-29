import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExport, CiExportInput, CiInstallation, CiRefreshResult, CiRun } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * CI module — export an agent to GitHub Actions and ingest the results.
 *   POST /agents/:id/export-ci        preview (`files`) or publish (`open_pr`)
 *   GET  /agents/:id/ci-installations installations of one agent
 *   GET  /ci-runs                     newest 100 ingested runs
 *   POST /ci-runs/refresh             read result artifacts from GitHub
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/export-ci',
    {
      schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => service.export(await getContext(app.container, req), req.params.id, req.body),
  );

  app.get(
    '/agents/:id/ci-installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) =>
      service.listInstallations(await getContext(app.container, req), req.params.id),
  );

  app.get(
    '/ci-runs',
    { schema: { response: { 200: z.array(CiRun) } } },
    async (req) => service.listRuns(await getContext(app.container, req)),
  );

  app.post(
    '/ci-runs/refresh',
    {
      schema: { response: { 200: CiRefreshResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => service.refresh(await getContext(app.container, req)),
  );
}
