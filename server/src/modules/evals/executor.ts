import type { EvalConfigSnapshot, EvalCounts, EvalExpectation, EvalMetrics, LLMProvider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EVAL_CONCURRENCY } from './constants.js';
import { aggregate, caseStatus, caseSummary, labelFindings, type AggregateInput } from './scoring.js';
import type { NewCaseResult } from './repository/eval-run.repo.js';

/** A case captured at run start; the executor never re-reads the DB (AC-19, AC-26b). */
export interface ExecCase {
  id: string;
  name: string;
  inputDiff: string;
  expectation: EvalExpectation;
}

/** Where the executor writes; backed by the run repository (the executor itself has no DB access). */
export interface EvalRunSink {
  insertCaseResult(r: NewCaseResult): Promise<void>;
  finishRun(
    runId: string,
    v: {
      status: 'done' | 'partial' | 'failed';
      metrics: EvalMetrics | null;
      counts: EvalCounts;
      costUsd: number | null;
      durationMs: number;
      error: string | null;
    },
  ): Promise<void>;
}

export interface EvalLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface EvalRunInput {
  runId: string;
  agentId: string;
  snapshot: EvalConfigSnapshot;
  /** Skill blocks formatted once at start, in link order. */
  skillBlocks: string[];
  cases: ExecCase[];
  llm: LLMProvider;
  sink: EvalRunSink;
  log: EvalLogger;
}

/**
 * Runs one eval run: ≤4 workers over the captured cases, one engine review per
 * case, fed ONLY the stored diff + the snapshot's prompt/model/strategy + skill
 * blocks (no intent, memory, specs, callers or repo map; AC-24, NG10). Scoring is
 * pure. Logs carry ids, counts, status, duration and cost only (NFR-6).
 */
export class EvalRunExecutor {
  async run(input: EvalRunInput): Promise<void> {
    const { runId, agentId, snapshot, cases, log, sink } = input;
    const started = Date.now();
    log.info({ runId, agentId, cases: cases.length }, 'eval run started');

    const results: AggregateInput[] = [];
    const errorByPosition = new Map<number, string>();
    let next = 0;

    const worker = async () => {
      while (next < cases.length) {
        const position = next++;
        const c = cases[position]!;
        const r = await this.runCase(input, c, position);
        if (r.error) errorByPosition.set(position, r.error);
        results.push(r.scored);
      }
    };
    await Promise.all(Array.from({ length: Math.min(EVAL_CONCURRENCY, cases.length) }, worker));

    const agg = aggregate(results);
    // AC-34: the run's error is the first case's message by position, not by finish time.
    const firstPosition = Math.min(...errorByPosition.keys());
    const firstError = errorByPosition.size > 0 ? errorByPosition.get(firstPosition)! : null;
    const durationMs = Date.now() - started;
    await sink.finishRun(runId, {
      status: agg.status,
      metrics: agg.metrics,
      counts: agg.counts,
      costUsd: agg.costUsd,
      durationMs,
      error: agg.status === 'failed' ? firstError : null,
    });
    log.info(
      { runId, agentId, status: agg.status, cases: cases.length, durationMs, costUsd: agg.costUsd, version: snapshot.agent_version },
      'eval run finished',
    );
  }

  private async runCase(
    input: EvalRunInput,
    c: ExecCase,
    position: number,
  ): Promise<{ scored: AggregateInput; error: string | null }> {
    const { runId, snapshot, skillBlocks, llm, sink, log } = input;
    const started = Date.now();
    try {
      const outcome = await reviewPullRequest({
        systemPrompt: snapshot.system_prompt,
        model: snapshot.model,
        strategy: snapshot.strategy,
        diff: parseUnifiedDiff(c.inputDiff),
        llm,
        ...(skillBlocks.length > 0 ? { skills: skillBlocks } : {}),
      });
      const labelled = labelFindings(
        outcome.review.findings.map((f) => ({
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line,
          severity: f.severity,
          category: f.category,
          title: f.title,
        })),
        c.expectation,
      );
      const status = caseStatus(c.expectation, labelled);
      const grounded = outcome.review.findings.length;
      const dropped = outcome.dropped.length;
      await sink.insertCaseResult({
        runId,
        caseId: c.id,
        position,
        caseName: c.name,
        expectation: c.expectation,
        status,
        findings: labelled,
        grounded,
        dropped,
        summary: caseSummary(c.expectation, labelled),
        costUsd: outcome.costUsd,
        durationMs: Date.now() - started,
        error: null,
      });
      return {
        scored: { status, expectation: c.expectation, findings: labelled, grounded, dropped, costUsd: outcome.costUsd },
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ runId, caseId: c.id, error: message }, 'eval case errored');
      await sink.insertCaseResult({
        runId,
        caseId: c.id,
        position,
        caseName: c.name,
        expectation: c.expectation,
        status: 'error',
        findings: [],
        grounded: 0,
        dropped: 0,
        summary: message,
        costUsd: null,
        durationMs: Date.now() - started,
        error: message,
      });
      return {
        scored: { status: 'error', expectation: c.expectation, findings: [], grounded: 0, dropped: 0, costUsd: null },
        error: message,
      };
    }
  }
}
