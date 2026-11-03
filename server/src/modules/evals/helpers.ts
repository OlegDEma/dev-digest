import { createHash } from 'node:crypto';
import type {
  EvalCase,
  EvalCaseInputFile,
  EvalCaseResult,
  EvalConfigSnapshot,
  EvalCounts,
  EvalExpectedItem,
  EvalMetrics,
  EvalPrMeta,
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

/** The run snapshot of a live agent: version, config fields and its prompt-shaping skills (`config_id` included). */
export function snapshotFrom(
  agent: { version: number; provider: string; model: string; systemPrompt: string; strategy: string },
  linked: readonly { skill: { id: string; name: string; version: number } }[],
): EvalConfigSnapshot {
  const base = {
    agent_version: agent.version,
    provider: agent.provider as EvalConfigSnapshot['provider'],
    model: agent.model,
    system_prompt: agent.systemPrompt,
    strategy: agent.strategy as EvalConfigSnapshot['strategy'],
    skills: linked.map(({ skill }) => ({ skill_id: skill.id, name: skill.name, version: skill.version })),
  };
  return { ...base, config_id: configId(base) };
}

/** JSON with sorted object keys: equal content compares equal whatever the key order it was stored in. */
function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val,
  );
}

/** Whether a save changes anything a run reads: diff, Files, PR meta or the expected list (a rename does not count). */
export function sameContent(
  row: EvalCaseRow,
  next: { inputDiff: string; inputFiles: EvalCaseInputFile[]; inputMeta: EvalPrMeta; expected: EvalExpectedItem[] },
): boolean {
  const cur = toEvalCaseDto(row, null);
  return (
    cur.input_diff === next.inputDiff &&
    stableJson(cur.input_files) === stableJson(next.inputFiles) &&
    stableJson(cur.pr_meta) === stableJson(next.inputMeta) &&
    stableJson(cur.expected) === stableJson(next.expected)
  );
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface LastResult {
  runId: string;
  status: 'pass' | 'fail' | 'error';
  ranAt: Date;
  summary: string;
  durationMs: number | null;
  costUsd: number | null;
  /** null on results written before revisions existed; read as 1. */
  caseRevision: number | null;
}

/** A legacy single expectation (columns `expectation_*` or a pre-list result row). */
interface LegacyExpectation {
  kind?: 'must_find' | 'must_not_flag';
  file?: string;
  start_line?: number;
  end_line?: number;
}

/**
 * Case expectations in the list shape. Prefers `expected_output`; a legacy case
 * (NULL there) maps its single expectation: must_find takes severity/category
 * from `display_*`, must_not_flag stays location-only (AC-D24).
 */
export function expectedFromRow(row: EvalCaseRow): EvalExpectedItem[] {
  if (Array.isArray(row.expectedOutput)) return row.expectedOutput as EvalExpectedItem[];
  if (row.expectationFile == null) return [];
  const start = row.expectationStartLine ?? 1;
  const base = { file: row.expectationFile, start_line: start, end_line: row.expectationEndLine ?? start };
  if ((row.expectationKind ?? 'must_find') === 'must_not_flag') {
    return [{ kind: 'must_not_flag', ...base }];
  }
  return [
    {
      kind: 'must_find',
      ...base,
      severity: (row.displaySeverity ?? 'SUGGESTION') as Severity,
      category: (row.displayCategory ?? 'style') as FindingCategory,
    },
  ];
}

/** A stored result's finding, as far as the legacy-expectation fallback needs it. */
interface ResultFinding {
  file?: string;
  start_line?: number;
  end_line?: number;
  severity?: Severity;
  category?: FindingCategory;
  label?: string;
}

/**
 * A stored result's expected list: the list as scored, or a wrapped legacy
 * object. A legacy `must_find` carried no severity/category (they lived on the
 * case's `display_*` columns, which a result row does not keep), so read-only
 * display values are borrowed from the true-positive finding at that location,
 * else the same defaults `expectedFromRow` uses — the list schema requires both.
 */
export function expectedFromResult(stored: unknown, findings: readonly ResultFinding[] = []): EvalExpectedItem[] {
  if (Array.isArray(stored)) return stored as EvalExpectedItem[];
  if (stored && typeof stored === 'object') {
    const l = stored as LegacyExpectation;
    if (l.file) {
      const start = l.start_line ?? 1;
      const end = l.end_line ?? start;
      const base = { file: l.file, start_line: start, end_line: end };
      if ((l.kind ?? 'must_find') === 'must_not_flag') return [{ kind: 'must_not_flag', ...base }];
      const hit = findings.find(
        (f) => f.label === 'tp' && f.file === l.file && (f.start_line ?? 0) <= end && start <= (f.end_line ?? f.start_line ?? 0),
      );
      return [
        {
          kind: 'must_find',
          ...base,
          severity: hit?.severity ?? 'SUGGESTION',
          category: hit?.category ?? 'style',
        },
      ];
    }
  }
  return [];
}

const EMPTY_PR_META: EvalPrMeta = { title: '', description: '' };

export function toEvalCaseDto(row: EvalCaseRow, last: LastResult | null): EvalCase {
  return {
    id: row.id,
    owner_kind: 'agent',
    owner_id: row.ownerId,
    name: row.name,
    expected: expectedFromRow(row),
    display:
      row.displayTitle == null
        ? null
        : {
            title: row.displayTitle,
            severity: (row.displaySeverity ?? 'SUGGESTION') as Severity,
            category: (row.displayCategory ?? 'style') as FindingCategory,
          },
    input_diff: row.inputDiff ?? '',
    input_files: Array.isArray(row.inputFiles) ? (row.inputFiles as EvalCaseInputFile[]) : [],
    pr_meta: (row.inputMeta as EvalPrMeta | null) ?? EMPTY_PR_META,
    source:
      row.sourceFindingId == null && row.sourcePrNumber == null
        ? null
        : {
            finding_id: row.sourceFindingId,
            pr_number: row.sourcePrNumber ?? 0,
            repo: row.sourceRepo ?? '',
          },
    revision: row.revision,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_result: last
      ? {
          run_id: last.runId,
          status: last.status,
          ran_at: last.ranAt.toISOString(),
          summary: last.summary,
          duration_ms: last.durationMs,
          cost_usd: last.costUsd,
          case_revision: last.caseRevision ?? 1,
        }
      : null,
  };
}

export function toEvalRunSummaryDto(row: EvalRunRow): EvalRunSummary {
  const metrics: EvalMetrics | null =
    row.status === 'queued' || row.status === 'running' || row.status === 'failed'
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
    scope: row.scope,
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
    expected: expectedFromResult(row.expectation, row.findings as ResultFinding[]),
    case_revision: row.caseRevision ?? 1,
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
