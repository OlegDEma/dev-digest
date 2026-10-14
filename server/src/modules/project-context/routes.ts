import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  DiscoveredDocument,
  DocumentContent,
  DocumentQuery,
  ProjectContextListing,
  SaveDocumentBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/** Raised above Fastify's default so an oversize save reaches the service (413 document_too_large). */
const SAVE_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * Project Context module.
 *   GET /repos/:id/context                 → discovered documents (C1)
 *   GET /repos/:id/context/document?path=  → one document's text (C2 read)
 *   PUT /repos/:id/context/document        → save edited text (C2 save)
 * Attach lists change via PUT /agents/:id/context-docs and /skills/:id/context-docs.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/document',
    { schema: { params: IdParams, querystring: DocumentQuery, response: { 200: DocumentContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.read(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/document',
    {
      bodyLimit: SAVE_BODY_LIMIT,
      schema: { params: IdParams, body: SaveDocumentBody, response: { 200: DiscoveredDocument } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.save(workspaceId, req.params.id, req.body.path, req.body.text);
    },
  );
}
