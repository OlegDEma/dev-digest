import { formatSkillBlock } from '@devdigest/reviewer-core';
import type {
  CreateEvalCaseResponse,
  EvalCase,
  EvalConfigSnapshot,
  EvalDashboardOverview,
  EvalRunDetail,
  EvalRunSummary,
  FindingCategory,
  Provider,
  Severity,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError } from '../../platform/errors.js';
import type { RequestContext } from '../_shared/context.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  EVAL_HISTORY_LIMIT,
  EVAL_NAME_RETRIES,
  EVAL_RECENT_LIMIT,
  MAX_EVAL_CASES_PER_AGENT,
} from './constants.js';
import { EvalRunExecutor, type EvalLogger, type ExecCase } from './executor.js';
import {
  caseNameFor,
  configId,
  sliceFileDiff,
  toEvalCaseDto,
  toEvalRunDetailDto,
  toEvalRunSummaryDto,
} from './helpers.js';
import * as caseRepo from './repository/eval-case.repo.js';
import * as runRepo from './repository/eval-run.repo.js';

const noopLog: EvalLogger = { info: () => {}, warn: () => {} };

/**
 * Eval pipeline use-cases: case creation from a decided finding, case CRUD, run
 * start (snapshot → durable `running` row → fire-and-forget executor), history,
 * dashboard and the boot reaper. No Fastify, no direct SQL (repositories only).
 */
export class EvalService {
  private readonly executor = new EvalRunExecutor();

  constructor(
    private readonly container: Container,
    private readonly log: EvalLogger = noopLog,
  ) {}

  private get db() {
    return this.container.db;
  }

  // ---- cases ---------------------------------------------------------------

  async createCaseFromFinding(
    ctx: RequestContext,
    findingId: string,
  ): Promise<CreateEvalCaseResponse> {
    const repo = this.container.reviewRepo;
    const found = await repo.findingContext(findingId);
    if (!found || found.review.workspaceId !== ctx.workspaceId) {
      throw new AppError('finding_not_found', 'Finding not found', 404);
    }
    const { finding, review, pull } = found;
    const kind = finding.acceptedAt ? 'must_find' : finding.dismissedAt ? 'must_not_flag' : null;
    if (!kind) {
      throw new AppError('finding_undecided', 'Accept or dismiss the finding first', 422);
    }
    if (!review.agentId) {
      throw new AppError(
        'finding_without_agent',
        'This finding was not produced by an agent, so it cannot become an eval case',
        422,
      );
    }
    const agent = await this.container.agentsRepo.getById(ctx.workspaceId, review.agentId);
    if (!agent) throw new AppError('finding_without_agent', 'The producing agent no longer exists', 422);

    const existing = await caseRepo.findBySourceFinding(this.db, ctx.workspaceId, findingId);
    if (existing) return this.caseResponse(existing, false);

    if ((await caseRepo.countForAgent(this.db, ctx.workspaceId, agent.id)) >= MAX_EVAL_CASES_PER_AGENT) {
      throw new AppError(
        'eval_case_limit',
        `An agent can have at most ${MAX_EVAL_CASES_PER_AGENT} eval cases — delete some first`,
        422,
        { limit: MAX_EVAL_CASES_PER_AGENT },
      );
    }

    const repoRow = await repo.getRepo(pull.repoId);
    if (!repoRow) throw new AppError('finding_not_found', 'Finding not found', 404);
    const unavailable = () =>
      new AppError(
        'diff_unavailable',
        `Diff for ${finding.file} is unavailable — open the PR to refresh its files, then retry`,
        422,
        { file: finding.file },
      );
    let raw: string;
    try {
      raw = (await loadDiff(this.container, repo, ctx.workspaceId, pull, repoRow)).raw;
    } catch {
      throw unavailable();
    }
    const inputDiff = sliceFileDiff(raw, finding.file);
    if (inputDiff === '') throw unavailable();

    // A concurrent creation can take the same slug between the read and the
    // insert (unique index): recompute the next free `-N` and try again.
    for (let attempt = 0; attempt < EVAL_NAME_RETRIES; attempt++) {
      const taken = await caseRepo.namesForAgent(this.db, ctx.workspaceId, agent.id);
      const res = await caseRepo.insertCase(this.db, {
        workspaceId: ctx.workspaceId,
        agentId: agent.id,
        name: caseNameFor(finding.title, taken),
        inputDiff,
        sourceFindingId: finding.id,
        sourcePrNumber: pull.number,
        sourceRepo: repoRow.fullName,
        expectationKind: kind,
        expectationFile: finding.file,
        expectationStartLine: finding.startLine,
        expectationEndLine: finding.endLine,
        displayTitle: finding.title,
        displaySeverity: finding.severity as Severity,
        displayCategory: finding.category as FindingCategory,
      });
      if ('nameTaken' in res) continue;
      return this.caseResponse(res.row, res.created);
    }
    throw new AppError('eval_case_name_conflict', 'Could not allocate a unique case name, retry', 409);
  }

  private caseResponse(
    row: Parameters<typeof toEvalCaseDto>[0],
    created: boolean,
  ): CreateEvalCaseResponse {
    return { case: toEvalCaseDto(row, null), created };
  }

  async listCases(ctx: RequestContext, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(ctx, agentId);
    const rows = await caseRepo.listForAgent(this.db, ctx.workspaceId, agentId);
    return rows.map((r) => toEvalCaseDto(r.row, r.last));
  }

  async deleteCase(ctx: RequestContext, id: string): Promise<void> {
    const ok = await caseRepo.deleteCase(this.db, ctx.workspaceId, id);
    if (!ok) throw new AppError('eval_case_not_found', 'Eval case not found', 404);
  }

  // ---- runs ----------------------------------------------------------------

  private async requireAgent(ctx: RequestContext, agentId: string) {
    const agent = await this.container.agentsRepo.getById(ctx.workspaceId, agentId);
    if (!agent) throw new AppError('agent_not_found', 'Agent not found', 404);
    return agent;
  }

  async startRun(ctx: RequestContext, agentId: string): Promise<EvalRunSummary> {
    // Disabled agents are runnable on purpose (AC-37).
    const agent = await this.requireAgent(ctx, agentId);
    const caseRows = await caseRepo.listForAgent(this.db, ctx.workspaceId, agentId);
    if (caseRows.length === 0) {
      throw new AppError('no_eval_cases', 'Add at least one eval case before running', 422);
    }

    let llm;
    try {
      llm = await this.container.llm(agent.provider as Provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          'provider_not_configured',
          `Provider ${agent.provider} is not configured: ${err.message}`,
          422,
          { provider: agent.provider },
        );
      }
      throw err;
    }

    // Everything the run uses is captured here, once (AC-26a/b, AC-19).
    const linked = await this.container.agentsRepo.enabledSkillsForPrompt(agent.id);
    const base = {
      agent_version: agent.version,
      provider: agent.provider as Provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      strategy: agent.strategy,
      skills: linked.map(({ skill }) => ({
        skill_id: skill.id,
        name: skill.name,
        version: skill.version,
      })),
    };
    const snapshot: EvalConfigSnapshot = { ...base, config_id: configId(base) };
    const skillBlocks = linked.map(({ skill }) => formatSkillBlock(skill.name, skill.body));
    const cases: ExecCase[] = [...caseRows].reverse().map(({ row }) => ({
      id: row.id,
      name: row.name,
      inputDiff: row.inputDiff ?? '',
      expectation: toEvalCaseDto(row, null).expectation,
    }));

    const inserted = await runRepo.insertRunningRun(this.db, {
      workspaceId: ctx.workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      config: snapshot,
      caseIds: cases.map((c) => c.id),
    });
    if ('conflict' in inserted) {
      throw new AppError(
        'eval_run_in_progress',
        'An eval run is already in progress for this agent',
        409,
        { run_id: inserted.conflict },
      );
    }
    const run = inserted.run;

    const sink = {
      insertCaseResult: (r: Parameters<typeof runRepo.insertCaseResult>[1]) =>
        runRepo.insertCaseResult(this.db, r),
      finishRun: (id: string, v: Parameters<typeof runRepo.finishRun>[2]) =>
        runRepo.finishRun(this.db, id, v),
    };
    // Fire-and-forget: the `running` row exists, a failure is recorded on it,
    // and the boot reaper covers a crash (onion rule 8).
    const done = this.executor
      .run({ runId: run.id, agentId: agent.id, snapshot, skillBlocks, cases, llm, sink, log: this.log })
      .catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.log.warn({ runId: run.id, error: message }, 'eval run crashed');
        await runRepo.failRun(this.db, run.id, message).catch(() => {});
      });
    void done.catch(() => {});

    return toEvalRunSummaryDto(run);
  }

  async listRuns(ctx: RequestContext, agentId: string): Promise<EvalRunSummary[]> {
    await this.requireAgent(ctx, agentId);
    const rows = await runRepo.listForAgent(this.db, ctx.workspaceId, agentId, EVAL_HISTORY_LIMIT);
    return rows.map(toEvalRunSummaryDto);
  }

  async getRun(ctx: RequestContext, id: string): Promise<EvalRunDetail> {
    const found = await runRepo.getRunWithResults(this.db, ctx.workspaceId, id);
    if (!found) throw new AppError('eval_run_not_found', 'Eval run not found', 404);
    return toEvalRunDetailDto(found.run, found.results);
  }

  async dashboard(ctx: RequestContext): Promise<EvalDashboardOverview> {
    const [agents, counts, latest, recent] = await Promise.all([
      this.container.agentsRepo.list(ctx.workspaceId),
      caseRepo.countsByAgent(this.db, ctx.workspaceId),
      runRepo.latestFinishedPerAgent(this.db, ctx.workspaceId),
      runRepo.recentForWorkspace(this.db, ctx.workspaceId, EVAL_RECENT_LIMIT),
    ]);
    const lastByAgent = new Map(latest.map((r) => [r.agentId, r]));
    return {
      agents: agents.map((a) => {
        const last = lastByAgent.get(a.id);
        return {
          agent_id: a.id,
          name: a.name,
          model: a.model,
          enabled: a.enabled,
          cases_total: counts.get(a.id) ?? 0,
          last_run: last ? toEvalRunSummaryDto(last) : null,
        };
      }),
      recent_runs: recent.map(toEvalRunSummaryDto),
    };
  }

  /** Boot reaper (app.ts): every `running` eval run is orphaned by the restart. */
  reapStaleRuns(): Promise<number> {
    return runRepo.reapRunning(this.db);
  }
}
