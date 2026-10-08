import type { Agent, ConventionCandidate, RunDetail, Severity } from '@devdigest/shared';
import * as T from './texts.js';

export const MAX_TEXT_CHARS = 20_000;
const SUMMARY_MAX = 400;
const RATIONALE_MAX = 600;
const AGENT_DESCRIPTION_MAX = 100;

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);

/**
 * Compact JSON, hard-capped. When over the cap, trailing items of `listKey` are
 * dropped (binary search) and `truncated:true` is set so the text stays valid JSON.
 * With `withNextOffset`, `next_offset` points at the first dropped item.
 */
export function toText(
  obj: Record<string, unknown>,
  listKey?: string,
  baseOffset = 0,
  withNextOffset = false,
): string {
  const whole = JSON.stringify(obj);
  if (whole.length <= MAX_TEXT_CHARS || listKey === undefined) return whole;
  const list = obj[listKey];
  if (!Array.isArray(list)) return whole.slice(0, MAX_TEXT_CHARS);
  const build = (keep: number): string =>
    JSON.stringify({
      ...obj,
      [listKey]: list.slice(0, keep),
      ...(withNextOffset ? { next_offset: baseOffset + keep } : {}),
      truncated: true,
    });
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (build(mid).length <= MAX_TEXT_CHARS) lo = mid;
    else hi = mid - 1;
  }
  return build(lo);
}

export interface ReviewOpts {
  limit: number;
  offset: number;
  detail: 'brief' | 'full';
  attached?: boolean;
}

/** `REVIEW` answer for a done run. */
export function reviewAnswer(detail: RunDetail, opts: ReviewOpts): string {
  const review = detail.review;
  const sorted = [...(review?.findings ?? [])].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line,
  );
  const total = sorted.length;
  const page = sorted.slice(opts.offset, opts.offset + opts.limit).map((f) => ({
    severity: f.severity,
    category: f.category,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    title: f.title,
    ...(opts.detail === 'full'
      ? {
          rationale: clip(f.rationale, RATIONALE_MAX),
          suggestion: f.suggestion ? clip(f.suggestion, RATIONALE_MAX) : null,
        }
      : {}),
  }));
  const end = opts.offset + page.length;
  return toText(
    {
      run_id: detail.run_id,
      agent: detail.agent_name ?? review?.agent_name ?? null,
      status: 'done',
      ...(opts.attached ? { attached: true } : {}),
      verdict: review?.verdict ?? null,
      score: review?.score ?? null,
      summary: review?.summary ? clip(review.summary, SUMMARY_MAX) : null,
      total,
      offset: opts.offset,
      next_offset: end < total ? end : null,
      findings: page,
    },
    'findings',
    opts.offset,
    true,
  );
}

/** `RUNNING` answer; `next` is the already-rendered §7b sentence. */
export function runningAnswer(runId: string, agentName: string | null, next: string): string {
  return toText({ run_id: runId, agent: agentName, status: 'running', next });
}

/** `NOT_IMPLEMENTED` answer (§7b, D27). */
export function notImplementedAnswer(next: string): string {
  return toText({ status: 'not_implemented', next });
}

export function agentsAnswer(agents: Agent[]): string {
  if (agents.length === 0) return toText({ agents: [], next: T.AGENTS_EMPTY_NEXT });
  return toText(
    {
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        model: a.model,
        enabled: a.enabled,
        description: clip(a.description, AGENT_DESCRIPTION_MAX),
      })),
    },
    'agents',
  );
}

export function conventionsAnswer(
  repo: string,
  status: string,
  all: ConventionCandidate[],
  limit: number,
): string {
  const items = all.slice(0, limit).map((c) => ({
    category: c.category,
    rule: c.rule,
    evidence_path: c.evidence_path,
    evidence_line: c.evidence_line ?? null,
  }));
  const next =
    all.length === 0
      ? status === 'accepted'
        ? T.CONVENTIONS_EMPTY_ACCEPTED_NEXT
        : T.conventionsEmptyNext(status, repo)
      : undefined;
  return toText(
    {
      repo,
      status,
      total: all.length,
      conventions: items,
      ...(next !== undefined ? { next } : {}),
    },
    'conventions',
  );
}
