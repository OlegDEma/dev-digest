import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES } from './constants.js';
import { SkillsService } from './service.js';

/**
 * Skills module — reusable review guidance bound to agents.
 *   GET    /skills                → list (workspace-scoped, with used_by counts)
 *   GET    /skills/:id            → one skill
 *   POST   /skills                → create
 *   PUT    /skills/:id            → update / toggle enabled (versions content changes)
 *   DELETE /skills/:id            → delete (agent bindings + versions cascade)
 *   GET    /skills/:id/agents     → agents binding this skill
 *   GET    /skills/:id/versions   → body history (newest first)
 *   GET    /skills/:id/stats      → 30-day usage / pull / accept / findings + binding agents
 *   POST   /skills/import         → parse a .md / .zip upload into a preview (persists nothing)
 *   POST   /skills/import-url     → fetch a remote .md / .zip (SSRF-guarded) → preview (persists nothing)
 *
 * Binding skills to an agent stays on the agents module (`/agents/:id/skills`).
 */

const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
  // Set by the conventions extractor: the files the skill's rules are grounded in.
  evidence_files: z.array(z.string()).max(200).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

/**
 * The upload is base64 in a JSON body (no multipart plugin). `content_b64` is
 * capped at the base64 expansion of MAX_UPLOAD_BYTES so an oversized file is a
 * clean 422 rather than a decode-then-reject; Fastify's 1 MB body limit is the
 * outer bound.
 */
const ImportSkillBody = z.object({
  filename: z.string().trim().min(1).max(255),
  content_b64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 64),
});

/** Import-from-URL: the server fetches the document (SSRF-guarded) and parses it. */
const ImportUrlBody = z.object({
  url: z.string().trim().url().max(2048),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  // Declared before `/skills/:id` for clarity; `:id` is uuid-validated so the
  // two never collide at runtime either.
  app.post('/skills/import', { schema: { body: ImportSkillBody } }, async (req) => {
    await getContext(app.container, req);
    return service.importPreview(req.body.filename, req.body.content_b64);
  });

  app.post('/skills/import-url', { schema: { body: ImportUrlBody } }, async (req) => {
    await getContext(app.container, req);
    return service.importUrlPreview(req.body.url);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agents = await service.agentsUsing(workspaceId, req.params.id);
    if (!agents) throw new NotFoundError('Skill not found');
    return agents;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });
}
