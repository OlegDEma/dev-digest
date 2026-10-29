import { createHash } from 'node:crypto';
import type {
  EvalCase,
  EvalCaseResult,
  EvalConfigSnapshot,
  EvalCounts,
  EvalMetrics,
  EvalRunDetail,
  EvalRunSummary,
  FindingCategory,
  Severity,
} from '@devdigest/shared';
import { slugify } from '../_shared/slug.js';
import type { EvalCaseRow, EvalCaseResultRow, EvalRunRow } from './repository/types.js';
import { EVAL_CASE_NAME_MAX } from './constants.js';

/**
 * Pure helpers for the evals module: naming, diff slicing, config hashing and the
 * camelCase (Drizzle row) → snake_case (contract) mappers.
 */

/** Slug of the finding title, suffixed `-2`, `-3`… until it is not in `taken` (≤ max incl. suffix). */
export function caseNameFor(title: string, taken: ReadonlySet<string>, max = EVAL_CASE_NAME_MAX): string {
  const base = slugify(title, max);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const stem = slugify(title, max - suffix.length).replace(/-+$/g, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Cut one file's section (all hunks) out of a multi-file unified diff, at the
 * `diff --git a/… b/<file>` header. Returns '' when the file is not in the diff.
 */
export function sliceFileDiff(raw: string, file: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      inside = line.endsWith(` b/${file}`);
    }
    if (inside) out.push(line);
  }
  const text = out.join('\n');
  return text.trim() === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
}

/** sha256 of the canonical (fixed key order) JSON of every snapshot field except `config_id`. */
export function configId(s: Omit<EvalConfigSnapshot, 'config_id'>): string {
  const canonical = JSON.stringify({
    agent_version: s.agent_version,
    provider: s.provider,
    model: s.model,
    system_prompt: s.system_prompt,
    strategy: s.strategy,
    skills: s.skills.map((k) => ({ skill_id: k.skill_id, name: k.name, version: k.version })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface LastResult {
  runId: string;
  status: 'pass' | 'fail' | 'error';
  ranAt: Date;
  summary: string;
}

export function toEvalCaseDto(row: EvalCaseRow, last: LastResult | null): EvalCase {
  return {
    id: row.id,
    owner_kind: 'agent',
    owner_id: row.ownerId,
    name: row.name,
    expectation: {
      kind: row.expectationKind ?? 'must_find',
      file: row.expectationFile ?? '',
      start_line: row.expectationStartLine ?? 1,
      end_line: row.expectationEndLine ?? row.expectationStartLine ?? 1,
    },
    display: {
      title: row.displayTitle ?? '',
      severity: (row.displaySeverity ?? 'SUGGESTION') as Severity,
      category: (row.displayCategory ?? 'style') as FindingCategory,
    },
    input_diff: row.inputDiff ?? '',
    source: {
      finding_id: row.sourceFindingId,
      pr_number: row.sourcePrNumber ?? 0,
      repo: row.sourceRepo ?? '',
    },
    created_at: row.createdAt.toISOString(),
    last_result: last
      ? {
          run_id: last.runId,
          status: last.status,
          ran_at: last.ranAt.toISOString(),
          summary: last.summary,
        }
      : null,
  };
}

export function toEvalRunSummaryDto(row: EvalRunRow): EvalRunSummary {
  const metrics: EvalMetrics | null =
    row.status === 'running' || row.status === 'failed'
      ? null
      : {
          recall: row.recall,
          precision: row.precision,
          strict_precision: row.strictPrecision,
          citation_accuracy: row.citationAccuracy,
          macro_recall: row.macroRecall,
          macro_precision: row.macroPrecision,
        };
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: row.agentName,
    status: row.status,
    started_at: row.startedAt.toISOString(),
    finished_at: iso(row.finishedAt),
    progress: { done: row.progressDone, total: row.progressTotal },
    config: row.config as EvalConfigSnapshot,
    case_ids: row.caseIds as string[],
    metrics,
    counts: (row.counts as EvalCounts | null) ?? null,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    error: row.error,
  };
}

export function toEvalCaseResultDto(row: EvalCaseResultRow): EvalCaseResult {
  return {
    case_id: row.caseId,
    case_name: row.caseName,
    expectation: row.expectation as EvalCaseResult['expectation'],
    status: row.status,
    findings: row.findings as EvalCaseResult['findings'],
    grounded: row.grounded,
    dropped: row.dropped,
    summary: row.summary,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    error: row.error,
  };
}

export function toEvalRunDetailDto(run: EvalRunRow, results: EvalCaseResultRow[]): EvalRunDetail {
  return { ...toEvalRunSummaryDto(run), results: results.map(toEvalCaseResultDto) };
}
