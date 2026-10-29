import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateEvalCaseResponse,
  EvalCase,
  EvalDashboardOverview,
  EvalRunDetail,
  EvalRunSummary,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Evals module — agent eval cases + runs (spec 2026-10-29-eval-pipeline).
 *   POST   /findings/:id/eval-case   decided finding → case (201 created / 200 existing)
 *   GET    /agents/:id/eval-cases    cases, newest first, with last result
 *   DELETE /eval-cases/:id           204
 *   POST   /agents/:id/eval-runs     202, runs in the background
 *   GET    /agents/:id/eval-runs     newest 50
 *   GET    /eval-runs/:id            run + per-case results
 *   GET    /eval-dashboard           per-agent cards + 20 recent runs
 * Every query is filtered by the caller's workspace.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container, app.log);

  app.post(
    '/findings/:id/eval-case',
    {
      schema: { params: IdParams, response: { 200: CreateEvalCaseResponse, 201: CreateEvalCaseResponse } },
    },
    async (req, reply) => {
      const ctx = await getContext(app.container, req);
      const res = await service.createCaseFromFinding(ctx, req.params.id);
      return reply.code(res.created ? 201 : 200).send(res);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req) => service.listCases(await getContext(app.container, req), req.params.id),
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      await service.deleteCase(await getContext(app.container, req), req.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalRunSummary } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const run = await service.startRun(await getContext(app.container, req), req.params.id);
      return reply.code(202).send(run);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalRunSummary) } } },
    async (req) => service.listRuns(await getContext(app.container, req), req.params.id),
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => service.getRun(await getContext(app.container, req), req.params.id),
  );

  app.get(
    '/eval-dashboard',
    { schema: { response: { 200: EvalDashboardOverview } } },
    async (req) => service.dashboard(await getContext(app.container, req)),
  );
}
