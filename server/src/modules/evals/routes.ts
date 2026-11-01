import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentEvalDashboard,
  AgentEvalDashboardQuery,
  CreateEvalCaseBody,
  CreateEvalCaseResponse,
  EvalBatchResult,
  EvalCase,
  EvalCaseDraftResponse,
  EvalCaseDraftBody,
  EvalConfigSnapshot,
  EvalDashboardOverview,
  EvalRunDetail,
  EvalRunSummary,
  PromoteEvalBody,
  PromoteEvalResult,
  StartEvalRunBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Evals module — agent eval cases + runs (spec 2026-10-29-eval-pipeline).
 *   POST   /findings/:id/eval-case        decided finding → case (201 created / 200 existing)
 *   GET    /findings/:id/eval-case-draft  editor prefill for any agent finding; persists nothing
 *   POST   /agents/:id/eval-cases         editor-authored case, 201
 *   PUT    /eval-cases/:id                edit a case, 200
 *   GET    /agents/:id/eval-cases         cases, newest first, with last result
 *   DELETE /eval-cases/:id                204
 *   POST   /agents/:id/eval-runs          202; optional {case_id} = scope-case run
 *   POST   /eval-runs/batch               202; "Run all agents" (≤2 execute, rest queued)
 *   GET    /agents/:id/eval-runs          newest 50
 *   GET    /eval-runs/:id                 run + per-case results
 *   GET    /agents/:id/eval-dashboard     per-agent page data (?range=7d|30d|90d)
 *   GET    /agents/:id/eval-config        the agent's live config snapshot (0 LLM)
 *   POST   /agents/:id/promote            apply a run's config as the next version
 *   GET    /eval-dashboard                per-agent rows + 20 recent full-set runs
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
    '/findings/:id/eval-case-draft',
    { schema: { params: IdParams, response: { 200: EvalCaseDraftResponse } } },
    async (req) => service.draftFromFinding(await getContext(app.container, req), req.params.id),
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: CreateEvalCaseBody, response: { 201: EvalCase } } },
    async (req, reply) => {
      const created = await service.createCase(await getContext(app.container, req), req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseDraftBody, response: { 200: EvalCase } } },
    async (req) => service.updateCase(await getContext(app.container, req), req.params.id, req.body),
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
      schema: { params: IdParams, body: StartEvalRunBody.nullable(), response: { 202: EvalRunSummary } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const run = await service.startRun(
        await getContext(app.container, req),
        req.params.id,
        req.body?.case_id,
      );
      return reply.code(202).send(run);
    },
  );

  app.post(
    '/eval-runs/batch',
    {
      schema: { response: { 202: EvalBatchResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const res = await service.startBatch(await getContext(app.container, req));
      return reply.code(202).send(res);
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

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, querystring: AgentEvalDashboardQuery, response: { 200: AgentEvalDashboard } } },
    async (req) =>
      service.agentDashboard(await getContext(app.container, req), req.params.id, req.query.range),
  );

  app.get(
    '/agents/:id/eval-config',
    { schema: { params: IdParams, response: { 200: EvalConfigSnapshot } } },
    async (req) => service.evalConfig(await getContext(app.container, req), req.params.id),
  );

  app.post(
    '/agents/:id/promote',
    { schema: { params: IdParams, body: PromoteEvalBody, response: { 200: PromoteEvalResult } } },
    async (req) => service.promote(await getContext(app.container, req), req.params.id, req.body),
  );
}
