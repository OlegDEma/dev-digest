import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq } from 'drizzle-orm';
import { NotificationRuleInput } from '../contracts/notifications.js';
import * as t from '../db/schema.js';
import { getContext } from '../shared/context.js';
import { IdParams } from '../shared/schemas.js';
import { NotificationService } from './service.js';

/**
 * Notifications module — per-repo rules that post a PR comment when a review
 * finishes with findings at or above a severity threshold.
 *   GET    /repos/:id/notification-rules
 *   POST   /repos/:id/notification-rules
 *   DELETE /notification-rules/:id
 */
export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new NotificationService(app.container);

  app.get('/repos/:id/notification-rules', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await app.container.db
      .select()
      .from(t.notificationRules)
      .where(
        and(
          eq(t.notificationRules.workspaceId, workspaceId),
          eq(t.notificationRules.repoId, req.params.id),
        ),
      )
      .orderBy(desc(t.notificationRules.createdAt));
    return rows.map((r) => ({
      id: r.id,
      repo_id: r.repoId,
      min_severity: r.minSeverity,
      enabled: r.enabled,
      created_at: r.createdAt.toISOString(),
    }));
  });

  app.post('/repos/:id/notification-rules', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const body = NotificationRuleInput.parse(req.body);
    const rule = await service.createRule(workspaceId, userId, req.params.id, body);
    reply.status(201);
    return rule;
  });

  app.delete('/notification-rules/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteRule(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
