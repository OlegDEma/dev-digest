import { describe, it, expect } from 'vitest';
import type { EvalRunSummary } from '@devdigest/shared';
import { metricDeltas, regressionFor } from '../src/modules/evals/regression.js';

function run(
  metrics: Partial<{ recall: number | null; precision: number | null; citation_accuracy: number | null }>,
  counts: { forbidden_hits?: number; fn?: number } = {},
  version = 7,
): EvalRunSummary {
  return {
    id: 'r',
    agent_id: 'a',
    agent_name: 'A',
    status: 'done',
    scope: 'all',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    progress: { done: 1, total: 1 },
    config: {
      agent_version: version,
      config_id: 'c',
      provider: 'openai',
      model: 'm',
      system_prompt: 'p',
      strategy: 'single-pass',
      skills: [],
    },
    case_ids: [],
    metrics: {
      recall: metrics.recall ?? null,
      precision: metrics.precision ?? null,
      strict_precision: null,
      citation_accuracy: metrics.citation_accuracy ?? null,
      macro_recall: null,
      macro_precision: null,
    },
    counts: {
      cases_total: 1, cases_scored: 1, cases_passed: 1, cases_failed: 0, cases_error: 0,
      must_find_total: 1, must_not_flag_total: 0, silent_total: 0, tp: 1, fn: counts.fn ?? 0,
      forbidden_hits: counts.forbidden_hits ?? 0, unlabelled: 0, emitted: 1, grounded: 1, dropped: 0,
    },
    cost_usd: null,
    duration_ms: null,
    error: null,
  };
}

describe('regression deltas (AC-D82, AC-D83)', () => {
  it('points are whole-point differences of the rounded percentages', () => {
    const d = metricDeltas(run({ recall: 0.911, precision: 0.5, citation_accuracy: 1 }), run({ recall: 0.904, precision: 0.5, citation_accuracy: 0.98 }));
    expect(d).toEqual([
      { metric: 'recall', points: 1 },
      { metric: 'precision', points: 0 },
      { metric: 'citation_accuracy', points: 2 },
    ]);
  });

  it('a drop of exactly 1 whole point is a regression; 0 points is not', () => {
    const one = regressionFor(run({ recall: 0.89 }), run({ recall: 0.9 }));
    expect(one?.drops).toEqual([{ metric: 'recall', points: -1 }]);
    expect(regressionFor(run({ recall: 0.9 }), run({ recall: 0.9 }))).toBeNull();
  });

  it('a sub-point wobble that rounds to the same percentage is no drop', () => {
    expect(regressionFor(run({ recall: 0.9049 }), run({ recall: 0.9041 }))).toBeNull();
  });

  it('null metrics on either side are skipped; all-null gives no regression', () => {
    expect(regressionFor(run({ recall: null }), run({ recall: 0.9 }))).toBeNull();
    expect(regressionFor(run({ recall: 0.5 }), run({ recall: null }))).toBeNull();
    const r = regressionFor(run({ recall: 0.5, precision: null }), run({ recall: 0.9, precision: 1 }));
    expect(r?.drops.map((d) => d.metric)).toEqual(['recall']);
  });

  it('carries rises, the latest version and the forbidden/fn deltas', () => {
    const r = regressionFor(
      run({ recall: 1, precision: 0.5, citation_accuracy: 1 }, { forbidden_hits: 2, fn: 0 }, 7),
      run({ recall: 0.9, precision: 0.52, citation_accuracy: 1 }, { forbidden_hits: 1, fn: 3 }),
    );
    expect(r).toEqual({
      agent_version: 7,
      drops: [{ metric: 'precision', points: -2 }],
      rises: [{ metric: 'recall', points: 10 }],
      forbidden_hits_delta: 1,
      fn_delta: -3,
    });
  });

  it('is null without a previous or latest run', () => {
    expect(regressionFor(run({ recall: 0.1 }), null)).toBeNull();
    expect(regressionFor(null, run({ recall: 0.1 }))).toBeNull();
  });
});
