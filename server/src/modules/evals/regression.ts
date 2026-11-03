import type { EvalMetricDelta, EvalMetricName, EvalRegression, EvalRunSummary } from '@devdigest/shared';

/** Pure regression maths for the per-agent page banner (AC-D82, AC-D83). No I/O, no LLM. */

const METRICS: EvalMetricName[] = ['recall', 'precision', 'citation_accuracy'];

const pct = (v: number) => Math.round(v * 100);

/** Whole-point change per metric (latest minus previous); a metric null on either side is skipped. */
export function metricDeltas(
  latest: EvalRunSummary,
  previous: EvalRunSummary,
): EvalMetricDelta[] {
  const out: EvalMetricDelta[] = [];
  for (const metric of METRICS) {
    const now = latest.metrics?.[metric];
    const before = previous.metrics?.[metric];
    if (now == null || before == null) continue;
    out.push({ metric, points: pct(now) - pct(before) });
  }
  return out;
}

/**
 * The regression between two finished full-set runs, or null unless at least one
 * metric dropped by 1+ whole points. The banner text is composed by the client
 * from this object.
 */
export function regressionFor(
  latest: EvalRunSummary | null,
  previous: EvalRunSummary | null,
): EvalRegression | null {
  if (!latest || !previous) return null;
  const deltas = metricDeltas(latest, previous);
  const drops = deltas.filter((d) => d.points <= -1);
  if (drops.length === 0) return null;
  return {
    agent_version: latest.config.agent_version,
    drops,
    rises: deltas.filter((d) => d.points >= 1),
    forbidden_hits_delta: (latest.counts?.forbidden_hits ?? 0) - (previous.counts?.forbidden_hits ?? 0),
    fn_delta: (latest.counts?.fn ?? 0) - (previous.counts?.fn ?? 0),
  };
}
