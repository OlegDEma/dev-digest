// server/src/modules/pulls/routes.ts
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export async function pullsRoutes(app: FastifyInstance) {
  app.get('/repos/:id/top-pulls', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, id)).orderBy(desc(t.pullRequests.additions));
    return rows.filter((r) => r.additions > 100).slice(0, 5).map((r) => ({ ...r, risk: r.additions > 500 ? 'high' : 'medium' }));
  });
}
