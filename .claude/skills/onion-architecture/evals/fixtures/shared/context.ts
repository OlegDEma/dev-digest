import type { FastifyRequest } from 'fastify';
import type { Container } from '../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

export async function getContext(_container: Container, req: FastifyRequest): Promise<RequestContext> {
  const workspaceId = req.headers['x-workspace-id'];
  const userId = req.headers['x-user-id'];
  return { workspaceId: String(workspaceId), userId: String(userId) };
}
