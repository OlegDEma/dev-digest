import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  IntentSource,
  PrIntentResponse,
  BlastRadius,
  PrBlastResponse,
  PrHistoryResponse,
  PrHistory,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  OnboardingTourResponse,
  OnboardingTour,
  OnboardingSkeletonReason,
  StructuredOutputError,
  isStructuredOutputError,
  EvalRun,
  PrBrief,
  PrBriefResponse,
  BriefModelOutput,
  ReviewFocusItem,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  EvalCase,
  EvalExpectation,
  AgentManifest,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({
        summary: 'x',
        in_scope: ['a'],
        out_of_scope: ['b'],
        risk_areas: [{ label: 'auth', kind: 'auth' }],
        missing_context: [],
        confidence: 'high',
      }),
    ).not.toThrow();
    expect(() =>
      IntentSource.parse({ kind: 'repo_doc', ref: 'specs/x.md', status: 'used', reason: null, tokens: 12 }),
    ).not.toThrow();
    expect(PrIntentResponse.parse({ intent: null, stale: false }).stale).toBe(false);
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    const blast = {
      changed_symbols: [{ name: 'getContext', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'getContext',
          callers: [{ name: 'routes', file: 'b.ts', line: 3 }],
          endpoints_affected: ['GET /x'],
          crons_affected: [],
          truncated: false,
        },
      ],
      summary: 's',
      counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
      degraded: false,
      reason: null,
      index_sha: 'abc',
      max_callers_per_symbol: 20,
      facts_by_file: { 'b.ts': { endpoints: ['GET /x'], crons: [] } },
    };
    expect(() => PrBlastResponse.parse(blast)).not.toThrow();
    expect(() => BlastRadius.parse(blast)).not.toThrow();
    expect(() => PrBlastResponse.parse({ ...blast, degraded: true, reason: 'FLAG_OFF' })).toThrow();
    const hist = {
      history: [{ pr_number: 3, title: 't', merged_at: '2026-01-01T00:00:00Z', author: 'a', files_overlap: ['a.ts'], notes: '' }],
      available: true,
      reason: null,
    };
    expect(() => PrHistoryResponse.parse(hist)).not.toThrow();
    expect(() => PrHistory.parse(hist)).not.toThrow();
    expect(() => PrHistoryResponse.parse({ ...hist, available: false, reason: 'NO_TOKEN' })).toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      specs_missing: [],
      specs_docs: [],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('Onboarding tour contract', () => {
  const index = {
    status: 'full' as const,
    files_indexed: 5,
    source_files_total: null,
    files_bounded: null,
    files_skipped: 0,
    last_indexed_sha: 'abc',
    hotness_available: false,
    clone_available: true,
  };
  const base = {
    title: 'T',
    provenance: 'from_index' as const,
    available: true,
    unavailable_reason: null,
    body_markdown: null,
    diagram: null,
  };
  const sections = () => [
    { kind: 'architecture_overview', ...base, items: [] },
    { kind: 'critical_paths', ...base, items: [] },
    { kind: 'run_locally', ...base, items: [] },
    { kind: 'reading_path', ...base, items: [] },
    {
      kind: 'first_tasks',
      ...base,
      available: false,
      unavailable_reason: 'Too few tasks',
      items: [],
    },
  ];
  const tour = (over: Record<string, unknown> = {}) => ({
    generated_at: '2026-10-11T00:00:00.000Z',
    mode: 'narrative',
    skeleton_reason: null,
    completeness: 'full',
    partial_reasons: [],
    index,
    llm: {
      calls: 1,
      call_id: 'c1',
      attempts: 1,
      provider: 'openai',
      model: 'm',
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
    },
    dropped_ai_items: 0,
    skipped_files: [],
    sections: sections(),
    ...over,
  });

  it('parses a response with no tour', () => {
    expect(() =>
      OnboardingTourResponse.parse({
        repo_id: 'r',
        repo_full_name: 'o/n',
        tour: null,
        current_index: index,
        generation_in_progress: false,
        last_failure: null,
      }),
    ).not.toThrow();
  });

  it('parses a narrative tour whose first_tasks section is unavailable with no items (AC-77)', () => {
    const t = OnboardingTour.parse(tour());
    const ft = t.sections[4]!;
    expect(ft.kind).toBe('first_tasks');
    expect(ft.available).toBe(false);
    expect(ft.items).toEqual([]);
    expect(() =>
      OnboardingTourResponse.parse({
        repo_id: 'r',
        repo_full_name: 'o/n',
        tour: tour(),
        current_index: index,
        generation_in_progress: false,
        last_failure: {
          at: '2026-10-11T00:00:00.000Z',
          reason: 'llm_timeout',
          provider: 'openai',
          attempts: null,
        },
      }),
    ).not.toThrow();
  });

  it('rejects skeleton_reason inconsistent with mode, wrong section order and bad enums', () => {
    expect(OnboardingTour.safeParse(tour({ skeleton_reason: 'no_clone' })).success).toBe(false);
    expect(OnboardingTour.safeParse(tour({ mode: 'skeleton' })).success).toBe(false);
    expect(
      OnboardingTour.safeParse(
        tour({ mode: 'skeleton', skeleton_reason: 'no_clone' }),
      ).success,
    ).toBe(true);
    const swapped = sections();
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(OnboardingTour.safeParse(tour({ sections: swapped })).success).toBe(false);
    expect(OnboardingTour.safeParse(tour({ sections: sections().slice(0, 4) })).success).toBe(false);
    expect(OnboardingSkeletonReason.safeParse('NO_CLONE').success).toBe(false);
    expect(
      OnboardingTour.safeParse(tour({ llm: { ...(tour().llm), calls: 2 } })).success,
    ).toBe(false);
  });

  it('StructuredOutputError is recognised by name and carries accounting', () => {
    const e = new StructuredOutputError({
      schemaName: 'S',
      attempts: 3,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: null,
    });
    expect(isStructuredOutputError(e)).toBe(true);
    expect(isStructuredOutputError(new Error('x'))).toBe(false);
    expect(e.statusCode).toBe(502);
    expect(e.attempts).toBe(3);
  });
});

describe('brief contracts', () => {
  const brief = () => ({
    intent: null,
    blast: null,
    risks: {
      risks: [
        { kind: 'secret', title: 'Hard-coded key', explanation: 'x', severity: 'high', file_refs: ['src/config.ts:3-5'] },
      ],
    },
    history: null,
    summary: 'Adds config.',
    review_focus: [
      { file: 'src/config.ts', line: 3, reason: 'secret', source: 'pr_diff', line_corrected: false },
    ],
    head_sha: 'abc1234',
    generated_at: '2026-10-12T00:00:00.000Z',
    provider: 'openai',
    model: 'gpt-x',
    calls: 1,
    attempts: 1,
    input_tokens: 900,
    input_budget: 8000,
    tokens_in: 900,
    tokens_out: 200,
    cost_usd: null,
    missing_inputs: [{ input: 'smart_diff', reason: 'Smart Diff roles are not available' }],
    specs: [{ path: 'docs/a.md', status: 'skipped', reason: 'over_budget', tokens: null }],
    reductions: [],
    dropped: { risks: 0, risk_refs: 0, review_focus: 0 },
    corrected_lines: 0,
  });

  it('parses a valid PrBrief and PrBriefResponse', () => {
    expect(PrBrief.parse(brief()).review_focus).toHaveLength(1);
    expect(PrBriefResponse.parse({ brief: null, stale: false }).stale).toBe(false);
    expect(PrBriefResponse.parse({ brief: brief(), stale: true }).brief?.model).toBe('gpt-x');
  });

  it('rejects wrong-case enums', () => {
    const b = brief();
    b.risks.risks[0].severity = 'HIGH';
    expect(PrBrief.safeParse(b).success).toBe(false);
    const c = brief();
    c.review_focus[0].source = 'PR_DIFF';
    expect(PrBrief.safeParse(c).success).toBe(false);
  });

  it('rejects ReviewFocusItem.line < 1 but the model-facing item allows it', () => {
    const item = { file: 'a.ts', line: 0, reason: 'r', source: 'pr_diff', line_corrected: false };
    expect(ReviewFocusItem.safeParse(item).success).toBe(false);
    expect(
      BriefModelOutput.safeParse({ summary: 's', risks: [], review_focus: [{ file: 'a.ts', line: 0, reason: 'r' }] }).success,
    ).toBe(true);
  });

  it('rejects BriefModelOutput missing review_focus', () => {
    expect(BriefModelOutput.safeParse({ summary: 's', risks: [] }).success).toBe(false);
  });
});

describe('Eval pipeline contracts', () => {
  const evalCase = () => ({
    id: 'c1',
    owner_kind: 'agent' as const,
    owner_id: 'a1',
    name: 'null-deref',
    expectation: { kind: 'must_find', file: 'src/a.ts', start_line: 3, end_line: 5 },
    display: { title: 'Null deref', severity: 'WARNING', category: 'bug' },
    input_diff: 'diff --git a/src/a.ts b/src/a.ts\n',
    source: { finding_id: 'f1', pr_number: 7, repo: 'o/r' },
    created_at: '2026-10-29T00:00:00.000Z',
    last_result: null,
  });

  it('parses a valid EvalCase (Severity UPPERCASE, category lowercase)', () => {
    expect(EvalCase.parse(evalCase()).display.severity).toBe('WARNING');
  });

  it('rejects a lowercase severity', () => {
    const c = evalCase();
    c.display.severity = 'warning';
    expect(EvalCase.safeParse(c).success).toBe(false);
  });

  it('rejects an EvalExpectation with end_line < start_line', () => {
    expect(
      EvalExpectation.safeParse({ kind: 'must_find', file: 'a.ts', start_line: 5, end_line: 4 }).success,
    ).toBe(false);
  });

  it('parses an AgentManifest without post_as to github_review', () => {
    const m = AgentManifest.parse({ name: 'n', model: 'm', system_prompt: 'p' });
    expect(m.post_as).toBe('github_review');
  });
});
