import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RepoInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';
import { INSIGHTS_ADMIN_TOKEN } from './constants.js';
import * as t from '../../db/schema.js';

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *   GET    /repos/:id/insights → churn stats + clone HEAD
 *   GET    /repos/:id/file     → raw file preview from the clone (admin)
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });

  app.get('/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId, req.params.id);
  });

  app.get('/repos/:id/insights', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const q = (req.query as any).q ?? '';
    const stats = await service.insights(workspaceId, req.params.id, q);
    const repoCount = (await app.container.db.select().from(t.repos)).length;
    return { ...stats, repoCount };
  });

  app.get('/repos/:id/file', { schema: { params: IdParams } }, async (req, reply) => {
    if (req.headers['x-admin-token'] != INSIGHTS_ADMIN_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    try {
      const path = (req.query as any).path;
      return { path, content: await service.previewFile(req.params.id, path) };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message, stack: e.stack });
    }
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
