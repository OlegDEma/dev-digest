import { formatSkillBlock } from '@devdigest/reviewer-core';
import {
  EvalCaseInputFile,
  EvalExpectedList,
  jsonPathOf,
  normalizeEvalDiff,
  validateEvalCaseDraft,
  type AgentEvalDashboard,
  type CreateEvalCaseBody,
  type CreateEvalCaseResponse,
  type EvalBatchItem,
  type EvalBatchResult,
  type EvalBatchSkip,
  type EvalCase,
  type EvalCaseContextReport,
  type EvalCaseDraftResponse,
  type EvalCaseDraftBody,
  type EvalConfigSnapshot,
  type EvalDashboardOverview,
  type EvalExpectedItem,
  type EvalRange,
  type EvalRunDetail,
  type EvalRunSummary,
  type FindingCategory,
  type PromoteEvalBody,
  type PromoteEvalResult,
  type Provider,
  type ReviewStrategy,
  type Severity,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError } from '../../platform/errors.js';
import type { RequestContext } from '../_shared/context.js';
import { toAgentDto } from '../agents/index.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  EVAL_AGENT_RUNS_LIMIT,
  EVAL_HISTORY_LIMIT,
  EVAL_ITEM_TITLE_MAX,
  EVAL_NAME_RETRIES,
  EVAL_RANGE_DAYS,
  EVAL_RECENT_LIMIT,
  EVAL_SPARKLINE_POINTS,
  MAX_EVAL_CASES_PER_AGENT,
} from './constants.js';
import { buildCaseContext, contextLogFields } from './case-context.js';
import { EvalRunExecutor, type EvalLogger, type ExecCase } from './executor.js';
import {
  caseNameFor,
  sameContent,
  sliceFileDiff,
  snapshotFrom,
  toEvalCaseDto,
  toEvalRunDetailDto,
  toEvalRunSummaryDto,
} from './helpers.js';
import { regressionFor } from './regression.js';
import { EvalBatchQueue } from './scheduler.js';
import * as caseRepo from './repository/eval-case.repo.js';
import * as runRepo from './repository/eval-run.repo.js';
import type { EvalCaseRow, EvalRunRow } from './repository/types.js';

const noopLog: EvalLogger = { info: () => {}, warn: () => {} };

type AgentRow = NonNullable<Awaited<ReturnType<Container['agentsRepo']['getById']>>>;
type LinkedSkillRow = Awaited<ReturnType<Container['agentsRepo']['enabledSkillsForPrompt']>>[number];
type FindingContext = NonNullable<Awaited<ReturnType<Container['reviewRepo']['findingContext']>>>;

const INVALID_DIFF_MESSAGES = {
  no_files: 'The diff has no files',
  no_hunks: 'A file in the diff has no hunks',
  missing_file_header: 'The diff has a hunk before any "+++ <path>" file header',
  ambiguous_multi_file: 'The diff has several files but is missing "diff --git" lines to tell them apart',
} as const;

/**
 * Eval pipeline use-cases: case creation (from a finding or by hand), case CRUD,
 * run start (snapshot → durable `running`/`queued` row → fire-and-forget
 * executor), batch runs, history, dashboards, Promote and the boot reaper. No
 * Fastify, no direct SQL (repositories only).
 */
export class EvalService {
  private readonly executor = new EvalRunExecutor();
  /** Batch runs only: ≤2 execute at once, the rest wait as `queued` rows (onion rule 8). */
  private readonly queue = new EvalBatchQueue();

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
    const { finding, pull } = found;
    const kind = finding.acceptedAt ? 'must_find' : finding.dismissedAt ? 'must_not_flag' : null;
    if (!kind) {
      throw new AppError('finding_undecided', 'Accept or dismiss the finding first', 422);
    }
    const agent = await this.findingAgent(ctx, found);

    const existing = await caseRepo.findBySourceFinding(this.db, ctx.workspaceId, findingId);
    if (existing) return this.caseResponse(existing, false);

    await this.requireRoom(ctx, agent.id);

    const expectedOutput: EvalExpectedItem[] = [
      {
        kind,
        file: finding.file,
        start_line: finding.startLine,
        end_line: finding.endLine,
        ...(kind === 'must_find'
          ? {
              severity: finding.severity as Severity,
              category: finding.category as FindingCategory,
            }
          : {}),
      },
    ];
    const valid = EvalExpectedList.safeParse(expectedOutput);
    if (!valid.success) {
      const issue = valid.error.issues[0]!;
      const path = jsonPathOf(issue.path);
      throw this.reject('invalid_expected_output', `Invalid expected output at ${path}: ${issue.message}`, 422, {
        path,
        message: issue.message,
      });
    }

    const { inputDiff, repoRow, inputFiles, inputMeta, context } = await this.findingInputs(ctx, found);

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
        expectedOutput,
        inputFiles,
        inputMeta,
      });
      if ('nameTaken' in res) continue;
      if (res.created) this.log.info(contextLogFields(context), 'eval case context built');
      return this.caseResponse(res.row, res.created, res.created ? context : undefined);
    }
    throw new AppError('eval_case_name_conflict', 'Could not allocate a unique case name, retry', 409);
  }

  /** The finding's producing agent, or the 422 `finding_without_agent` the base contract names. */
  private async findingAgent(ctx: RequestContext, found: FindingContext) {
    const { review } = found;
    if (!review.agentId) {
      throw new AppError(
        'finding_without_agent',
        'This finding was not produced by an agent, so it cannot become an eval case',
        422,
      );
    }
    const agent = await this.container.agentsRepo.getById(ctx.workspaceId, review.agentId);
    if (!agent) throw new AppError('finding_without_agent', 'The producing agent no longer exists', 422);
    return agent;
  }

  private async requireRoom(ctx: RequestContext, agentId: string): Promise<void> {
    if ((await caseRepo.countForAgent(this.db, ctx.workspaceId, agentId)) >= MAX_EVAL_CASES_PER_AGENT) {
      throw new AppError(
        'eval_case_limit',
        `An agent can have at most ${MAX_EVAL_CASES_PER_AGENT} eval cases — delete some first`,
        422,
        { limit: MAX_EVAL_CASES_PER_AGENT },
      );
    }
  }

  /**
   * Everything a finding-derived case is built from, for the one-click and the
   * draft path alike: the finding's file diff (whole-file diff of AC-3a) plus the
   * other PR files and PR meta, from one `loadDiff` call.
   */
  private async findingInputs(ctx: RequestContext, found: FindingContext) {
    const repo = this.container.reviewRepo;
    const { finding, pull } = found;
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
    const built = buildCaseContext({
      raw,
      findingFile: finding.file,
      findingSection: inputDiff,
      pull: { title: pull.title, body: pull.body, filesCount: pull.filesCount },
    });
    return { inputDiff, repoRow, ...built };
  }

  private caseResponse(row: EvalCaseRow, created: boolean, context?: EvalCaseContextReport): CreateEvalCaseResponse {
    return { case: toEvalCaseDto(row, null), created, ...(context ? { context } : {}) };
  }

  /** Counts a rejected save by code only — never its content (NFR-D7). */
  private reject(code: string, message: string, status: number, details?: unknown): AppError {
    this.log.info({ code }, 'eval case save rejected');
    return new AppError(code, message, status, details);
  }

  /** Normalise (CRLF → LF) and validate an editor body; throws the spec's coded 422. */
  private prepareDraft(body: EvalCaseDraftBody) {
    const inputFiles = body.input_files.map((f) => ({ path: f.path, content: normalizeEvalDiff(f.content) }));
    const inputDiff = normalizeEvalDiff(body.input_diff);
    const bad = inputFiles.findIndex((f) => !EvalCaseInputFile.safeParse(f).success);
    if (bad >= 0) {
      throw this.reject('invalid_input_file', 'A file needs a path of 1-300 characters', 422, { index: bad });
    }
    const err = validateEvalCaseDraft({
      name: body.name,
      input_diff: inputDiff,
      input_files: inputFiles,
      pr_meta: body.pr_meta,
      expected: body.expected,
    });
    if (err) {
      switch (err.code) {
        case 'invalid_name':
          throw this.reject('invalid_name', 'Name must be 1-60 characters of a-z, 0-9 and -', 422);
        case 'invalid_diff':
          throw this.reject('invalid_diff', INVALID_DIFF_MESSAGES[err.reason], 422, {
            reason: err.reason,
            ...(err.file !== undefined ? { file: err.file } : {}),
          });
        case 'input_too_large':
          throw this.reject('input_too_large', `Input is too large (${err.limit})`, 422, { limit: err.limit });
        case 'duplicate_file_path':
          throw this.reject('duplicate_file_path', `File path ${err.path} appears twice`, 422, { path: err.path });
        case 'invalid_expected_output':
          throw this.reject('invalid_expected_output', `Invalid expected output at ${err.path}: ${err.message}`, 422, {
            path: err.path,
            message: err.message,
          });
      }
    }
    return {
      name: body.name,
      inputDiff,
      inputFiles,
      inputMeta: { title: body.pr_meta.title, description: body.pr_meta.description },
      expected: EvalExpectedList.parse(body.expected),
    };
  }

  /** `POST /agents/:id/eval-cases` — an editor-authored case, optionally linked to a finding. */
  async createCase(ctx: RequestContext, agentId: string, body: CreateEvalCaseBody): Promise<EvalCase> {
    await this.requireAgent(ctx, agentId);
    const draft = this.prepareDraft(body);
    await this.requireRoom(ctx, agentId);

    let source: Pick<
      caseRepo.ManualCaseValues,
      'sourceFindingId' | 'sourcePrNumber' | 'sourceRepo' | 'displayTitle' | 'displaySeverity' | 'displayCategory'
    > = {};
    if (body.source_finding_id) {
      const found = await this.container.reviewRepo.findingContext(body.source_finding_id);
      if (!found || found.review.workspaceId !== ctx.workspaceId || found.review.agentId !== agentId) {
        throw new AppError('finding_not_found', 'Finding not found', 404);
      }
      const existing = await caseRepo.findBySourceFinding(this.db, ctx.workspaceId, found.finding.id);
      if (existing) {
        throw new AppError('eval_case_exists', 'This finding is already an eval case', 409, { case_id: existing.id });
      }
      const repoRow = await this.container.reviewRepo.getRepo(found.pull.repoId);
      source = {
        sourceFindingId: found.finding.id,
        sourcePrNumber: found.pull.number,
        sourceRepo: repoRow?.fullName ?? '',
        displayTitle: found.finding.title,
        displaySeverity: found.finding.severity,
        displayCategory: found.finding.category,
      };
    }

    const res = await caseRepo.insertManualCase(this.db, {
      workspaceId: ctx.workspaceId,
      agentId,
      name: draft.name,
      inputDiff: draft.inputDiff,
      inputFiles: draft.inputFiles,
      inputMeta: draft.inputMeta,
      expectedOutput: draft.expected,
      ...source,
    });
    if ('findingTaken' in res) {
      const existing = source.sourceFindingId
        ? await caseRepo.findBySourceFinding(this.db, ctx.workspaceId, source.sourceFindingId)
        : undefined;
      throw new AppError('eval_case_exists', 'This finding is already an eval case', 409, {
        case_id: existing?.id ?? null,
      });
    }
    if ('nameTaken' in res) throw this.nameTaken();
    return toEvalCaseDto(res.row, null);
  }

  private nameTaken(): AppError {
    return this.reject('eval_case_name_taken', 'Another eval case of this agent already has that name', 409);
  }

  /** `PUT /eval-cases/:id` — a failed save leaves the stored case unchanged (AC-D20a). */
  async updateCase(ctx: RequestContext, id: string, body: EvalCaseDraftBody): Promise<EvalCase> {
    const row = await caseRepo.getCase(this.db, ctx.workspaceId, id);
    if (!row) throw new AppError('eval_case_not_found', 'Eval case not found', 404);
    const draft = this.prepareDraft(body);
    const legacyContentChanged = !sameContent(row, draft);
    const res = await caseRepo.updateCase(
      this.db,
      ctx.workspaceId,
      id,
      {
        name: draft.name,
        inputDiff: draft.inputDiff,
        inputFiles: draft.inputFiles,
        inputMeta: draft.inputMeta,
        expectedOutput: draft.expected,
      },
      legacyContentChanged,
    );
    if (!res) throw new AppError('eval_case_not_found', 'Eval case not found', 404);
    if ('nameTaken' in res) throw this.nameTaken();
    const last = (await caseRepo.lastResults(this.db, [id])).get(id) ?? null;
    return toEvalCaseDto(res.row, last);
  }

  /** `GET /findings/:id/eval-case-draft` — what the editor opens with; nothing is persisted, 0 LLM. */
  async draftFromFinding(ctx: RequestContext, findingId: string): Promise<EvalCaseDraftResponse> {
    const found = await this.container.reviewRepo.findingContext(findingId);
    if (!found || found.review.workspaceId !== ctx.workspaceId) {
      throw new AppError('finding_not_found', 'Finding not found', 404);
    }
    const agent = await this.findingAgent(ctx, found);
    const existing = await caseRepo.findBySourceFinding(this.db, ctx.workspaceId, findingId);
    if (existing) {
      throw new AppError('eval_case_exists', 'This finding is already an eval case', 409, { case_id: existing.id });
    }
    const { inputDiff, inputFiles, inputMeta, context } = await this.findingInputs(ctx, found);
    this.log.info(contextLogFields(context), 'eval case context built');
    const { finding } = found;
    const taken = await caseRepo.namesForAgent(this.db, ctx.workspaceId, agent.id);
    return {
      name: caseNameFor(finding.title, taken),
      input_diff: inputDiff,
      input_files: inputFiles,
      pr_meta: { title: inputMeta.title, description: inputMeta.description },
      context,
      expected: [
        {
          kind: 'must_find',
          file: finding.file,
          start_line: finding.startLine,
          end_line: finding.endLine,
          severity: finding.severity as Severity,
          category: finding.category as FindingCategory,
          ...(finding.title ? { title: finding.title.slice(0, EVAL_ITEM_TITLE_MAX).replace(/[\uD800-\uDBFF]$/, '') } : {}),
        },
      ],
    };
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

  /** The live config snapshot of an agent and its skill blocks, captured once per run. */
  private async buildSnapshot(agent: AgentRow) {
    const linked = await this.container.agentsRepo.enabledSkillsForPrompt(agent.id);
    return {
      snapshot: snapshotFrom(agent, linked),
      skillBlocks: linked.map(({ skill }) => formatSkillBlock(skill.name, skill.body)),
    };
  }

  private toExecCase(row: EvalCaseRow): ExecCase {
    const dto = toEvalCaseDto(row, null);
    return {
      id: row.id,
      name: row.name,
      inputDiff: dto.input_diff,
      inputFiles: dto.input_files,
      prMeta: dto.pr_meta,
      revision: dto.revision,
      expected: dto.expected,
    };
  }

  /** Fails with 422 `provider_not_configured` when the agent's provider has no key. */
  private async requireProvider(agent: AgentRow) {
    try {
      return await this.container.llm(agent.provider as Provider);
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
  }

  private sink() {
    return {
      insertCaseResult: (r: Parameters<typeof runRepo.insertCaseResult>[1]) =>
        runRepo.insertCaseResult(this.db, r),
      finishRun: (id: string, v: Parameters<typeof runRepo.finishRun>[2]) =>
        runRepo.finishRun(this.db, id, v),
    };
  }

  /** Records a crash on the run row; never throws. */
  private async crashed(runId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.log.warn({ runId, errorName: err instanceof Error ? err.name : 'non-error' }, 'eval run crashed');
    await runRepo.failRun(this.db, runId, message).catch(() => {});
  }

  async startRun(ctx: RequestContext, agentId: string, caseId?: string): Promise<EvalRunSummary> {
    // Disabled agents are runnable on purpose (AC-37).
    const agent = await this.requireAgent(ctx, agentId);
    let selected: EvalCaseRow[];
    if (caseId) {
      const one = await caseRepo.getCase(this.db, ctx.workspaceId, caseId);
      if (!one || one.agentId !== agentId) throw new AppError('eval_case_not_found', 'Eval case not found', 404);
      selected = [one];
    } else {
      const ids = await caseRepo.idsForAgent(this.db, ctx.workspaceId, agentId);
      if (ids.length === 0) throw new AppError('no_eval_cases', 'Add at least one eval case before running', 422);
      selected = await caseRepo.listByIds(this.db, ctx.workspaceId, agentId, ids);
    }

    const llm = await this.requireProvider(agent);

    // Everything the run uses is captured here, once (AC-26a/b, AC-19).
    const { snapshot, skillBlocks } = await this.buildSnapshot(agent);
    const cases = selected.map((r) => this.toExecCase(r));

    const inserted = await runRepo.insertRunningRun(this.db, {
      workspaceId: ctx.workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      config: snapshot,
      caseIds: cases.map((c) => c.id),
      scope: caseId ? 'case' : 'all',
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

    // Fire-and-forget: the `running` row exists, a failure is recorded on it,
    // and the boot reaper covers a crash (onion rule 8).
    const done = this.executor
      .run({ runId: run.id, agentId: agent.id, snapshot, skillBlocks, cases, llm, sink: this.sink(), log: this.log })
      .catch((err: unknown) => this.crashed(run.id, err));
    void done.catch(() => {});

    return toEvalRunSummaryDto(run);
  }

  /**
   * "Run all agents": one scope-`all` run per eligible agent. Snapshots and case
   * ids are captured now (AC-D81); case content is read when the run gets its
   * slot. Rows are inserted in one transaction before anything executes (AC-D78b).
   */
  async startBatch(ctx: RequestContext): Promise<EvalBatchResult> {
    const [agents, counts, active] = await Promise.all([
      this.container.agentsRepo.list(ctx.workspaceId),
      caseRepo.countsByAgent(this.db, ctx.workspaceId),
      runRepo.activeAgentIds(this.db, ctx.workspaceId),
    ]);

    const skipped: EvalBatchSkip[] = [];
    const eligible: { agent: AgentRow; caseIds: string[]; snapshot: EvalConfigSnapshot; skillBlocks: string[] }[] = [];
    const skip = (a: AgentRow, reason: EvalBatchSkip['reason']) =>
      skipped.push({ agent_id: a.id, agent_name: a.name, reason });

    for (const agent of agents) {
      if (!agent.enabled) skip(agent, 'disabled');
      else if ((counts.get(agent.id) ?? 0) === 0) skip(agent, 'no_eval_cases');
      else if (active.has(agent.id)) skip(agent, 'eval_run_in_progress');
      else {
        try {
          await this.container.llm(agent.provider as Provider);
        } catch (err) {
          if (!(err instanceof ConfigError)) throw err;
          skip(agent, 'provider_not_configured');
          continue;
        }
        const caseIds = await caseRepo.idsForAgent(this.db, ctx.workspaceId, agent.id);
        const { snapshot, skillBlocks } = await this.buildSnapshot(agent);
        eligible.push({ agent, caseIds, snapshot, skillBlocks });
      }
    }

    // Claim slots synchronously, before the awaited insert: two concurrent
    // batches can then never both insert `running` rows for the same free slots.
    const free = this.queue.reserve(eligible.length);
    let created: EvalRunRow[];
    let conflicts: string[];
    try {
      ({ created, conflicts } = await runRepo.insertBatchRuns(
        this.db,
        eligible.map((e, i) => ({
          workspaceId: ctx.workspaceId,
          agentId: e.agent.id,
          agentName: e.agent.name,
          config: e.snapshot,
          caseIds: e.caseIds,
          scope: 'all' as const,
          status: i < free ? ('running' as const) : ('queued' as const),
        })),
      ));
    } catch (err) {
      this.queue.release(free);
      throw err;
    }
    this.queue.release(free - created.filter((r) => r.status === 'running').length);
    for (const id of conflicts) {
      const e = eligible.find((x) => x.agent.id === id)!;
      skip(e.agent, 'eval_run_in_progress');
    }

    const started: EvalBatchItem[] = [];
    const queued: EvalBatchItem[] = [];
    for (const run of created) {
      const e = eligible.find((x) => x.agent.id === run.agentId)!;
      const item = { agent_id: run.agentId, agent_name: run.agentName, run_id: run.id, cases: e.caseIds.length };
      (run.status === 'running' ? started : queued).push(item);
      const done = this.queue
        .submit(() => this.executeBatchRun(ctx, run, e.agent, e.snapshot, e.skillBlocks), run.status === 'running')
        .catch((err: unknown) => this.crashed(run.id, err));
      void done.catch(() => {});
    }

    const reasons: Record<string, number> = {};
    for (const s of skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
    this.log.info(
      { started: started.length, queued: queued.length, skipped: skipped.length, reasons },
      'eval batch accepted',
    );
    return { started, queued, skipped };
  }

  /** The slot-holding half of a batch run: queued → running, read the cases now (Q1-a), execute. */
  private async executeBatchRun(
    ctx: RequestContext,
    run: EvalRunRow,
    agent: AgentRow,
    snapshot: EvalConfigSnapshot,
    skillBlocks: string[],
  ): Promise<void> {
    await runRepo.markRunning(this.db, run.id);
    const current = await runRepo.getRun(this.db, ctx.workspaceId, run.id);
    if (current?.status !== 'running') return; // reaped or failed while waiting
    const rows = await caseRepo.listByIds(this.db, ctx.workspaceId, agent.id, run.caseIds as string[]);
    if (rows.length === 0) {
      await runRepo.failRun(this.db, run.id, 'all eval cases were deleted before the run started');
      return;
    }
    if (rows.length !== (run.caseIds as string[]).length) {
      await runRepo.setProgressTotal(this.db, run.id, rows.length);
    }
    const llm = await this.requireProvider(agent);
    await this.executor.run({
      runId: run.id,
      agentId: agent.id,
      snapshot,
      skillBlocks,
      cases: rows.map((r) => this.toExecCase(r)),
      llm,
      sink: this.sink(),
      log: this.log,
    });
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

  // ---- dashboards ------------------------------------------------------------

  async dashboard(ctx: RequestContext): Promise<EvalDashboardOverview> {
    const [agents, counts, latest, sparklines, recent] = await Promise.all([
      this.container.agentsRepo.list(ctx.workspaceId),
      caseRepo.countsByAgent(this.db, ctx.workspaceId),
      runRepo.latestFinishedFullPerAgent(this.db, ctx.workspaceId),
      runRepo.sparklinesByAgent(this.db, ctx.workspaceId, EVAL_SPARKLINE_POINTS),
      runRepo.recentFullForWorkspace(this.db, ctx.workspaceId, EVAL_RECENT_LIMIT),
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
          sparkline: sparklines.get(a.id) ?? [],
          last_full_run: last ? toEvalRunSummaryDto(last) : null,
        };
      }),
      recent_runs: recent.map(toEvalRunSummaryDto),
    };
  }

  /** Per-agent page data; metrics come from finished scope-`all` runs, the run table from both scopes. */
  async agentDashboard(ctx: RequestContext, agentId: string, range: EvalRange): Promise<AgentEvalDashboard> {
    const agent = await this.requireAgent(ctx, agentId);
    const since = new Date(Date.now() - EVAL_RANGE_DAYS[range] * 86_400_000);
    const [pair, full, runs] = await Promise.all([
      runRepo.latestTwoFinishedFull(this.db, ctx.workspaceId, agentId),
      runRepo.finishedFullRuns(this.db, ctx.workspaceId, agentId, since),
      runRepo.listForAgentSince(this.db, ctx.workspaceId, agentId, since, EVAL_AGENT_RUNS_LIMIT),
    ]);
    const latest = pair[0] ? toEvalRunSummaryDto(pair[0]) : null;
    const previous = pair[1] ? toEvalRunSummaryDto(pair[1]) : null;
    return {
      agent: { id: agent.id, name: agent.name, model: agent.model },
      range,
      latest,
      previous,
      series: full.map((r) => ({
        run_id: r.id,
        ran_at: r.startedAt.toISOString(),
        agent_version: (r.config as EvalConfigSnapshot).agent_version,
        recall: r.recall,
        precision: r.precision,
        citation_accuracy: r.citationAccuracy,
      })),
      runs: runs.map(toEvalRunSummaryDto),
      regression: regressionFor(latest, previous),
    };
  }

  /** The agent's live config snapshot (with `config_id`); 0 LLM calls. */
  async evalConfig(ctx: RequestContext, agentId: string): Promise<EvalConfigSnapshot> {
    const agent = await this.requireAgent(ctx, agentId);
    return (await this.buildSnapshot(agent)).snapshot;
  }

  // ---- promote -----------------------------------------------------------------

  /** Apply run B's config to the agent as the next version, atomically (AC-D57..59). */
  async promote(ctx: RequestContext, agentId: string, body: PromoteEvalBody): Promise<PromoteEvalResult> {
    await this.requireAgent(ctx, agentId);
    const run = await runRepo.getRun(this.db, ctx.workspaceId, body.run_id);
    if (!run || run.agentId !== agentId) {
      throw new AppError('eval_run_not_found', 'Eval run not found', 404);
    }
    const config = run.config as EvalConfigSnapshot;

    const outcome = await this.container.agentsRepo.promoteConfig(
      ctx.workspaceId,
      agentId,
      {
        provider: config.provider,
        model: config.model,
        systemPrompt: config.system_prompt,
        strategy: config.strategy as ReviewStrategy,
        skills: config.skills.map((s) => ({ skillId: s.skill_id, name: s.name })),
      },
      ({ row, enabledSkills }: { row: AgentRow; enabledSkills: LinkedSkillRow[] }) => {
        const live = snapshotFrom(row, enabledSkills).config_id;
        if (live !== body.expected_config_id) return 'agent_changed';
        if (live === config.config_id) return 'already_current';
        return 'ok';
      },
    );

    if (!outcome.ok) {
      switch (outcome.reason) {
        case 'agent_not_found':
          throw new AppError('agent_not_found', 'Agent not found', 404);
        case 'agent_changed':
          throw new AppError(
            'agent_changed',
            'The agent changed since you opened this comparison — reload and review again',
            409,
          );
        case 'already_current':
          throw new AppError('already_current', "That config is already the agent's current config", 409);
        case 'skill_unavailable':
          throw new AppError(
            'skill_unavailable',
            `Skills no longer exist: ${outcome.skills.join(', ')}`,
            422,
            { skills: outcome.skills },
          );
      }
    }
    this.log.info(
      { agentId, runId: run.id, from: outcome.from, to: outcome.row.version },
      'eval config promoted',
    );
    return { agent: toAgentDto(outcome.row), version: outcome.row.version };
  }

  /** Boot reaper (app.ts): every `running` or `queued` eval run is orphaned by the restart. */
  reapStaleRuns(): Promise<number> {
    return runRepo.reapRunning(this.db);
  }
}
