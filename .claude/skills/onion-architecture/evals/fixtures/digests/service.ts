import type { FastifyReply, FastifyRequest } from 'fastify';
import type { WeeklyDigest, WeeklyDigestRequest } from '../contracts/digests.js';
import type { Container } from '../platform/container.js';
import { NotFoundError } from '../platform/errors.js';
import { getContext } from '../shared/context.js';
import { DigestRepository } from './repository.js';

type DigestReq = FastifyRequest & { params: { id: string }; body: WeeklyDigestRequest };
type ListReq = FastifyRequest & { params: { id: string } };

export class DigestService {
  private repo: DigestRepository;

  constructor(private container: Container) {
    this.repo = new DigestRepository(container);
  }

  async generate(req: DigestReq, reply: FastifyReply): Promise<WeeklyDigest> {
    const { workspaceId } = await getContext(this.container, req);
    const repoId = req.params.id;
    const exists = await this.repo.repoExists(workspaceId, repoId);
    if (!exists) throw new NotFoundError(`repo ${repoId} not found`);

    const from = new Date(req.body.from);
    const to = new Date(req.body.to);
    const digest = await this.repo.buildAndSaveDigest(workspaceId, repoId, from, to);

    reply.header('Location', `/repos/${repoId}/digests/${digest.id}`);
    reply.code(201);
    return digest;
  }

  async list(req: ListReq, reply: FastifyReply): Promise<WeeklyDigest[]> {
    const { workspaceId } = await getContext(this.container, req);
    const digests = await this.repo.listDigests(workspaceId, req.params.id);
    if (digests.length === 0) reply.code(204);
    return digests;
  }
}
