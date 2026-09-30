import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

describe('reviewPullRequest — intent scope cap', () => {
  const f = (id: string, severity: string, title: string, confidence: number) => ({
    id, severity, category: 'bug', title, file: 'src/config.ts', start_line: 11, end_line: 11,
    rationale: 'r', confidence, kind: 'finding',
  });
  const intent = {
    summary: 's', in_scope: [], out_of_scope: [], risk_areas: [], missing_context: [], confidence: 'high' as const,
  };
  const review = {
    verdict: 'comment', summary: 's', score: 50,
    findings: [
      f('a', 'WARNING', 'Out of scope: minor thing', 0.9),
      f('b', 'CRITICAL', 'Out of scope: big thing', 0.5),
      f('c', 'SUGGESTION', 'Out of scope: nit', 0.99),
      f('d', 'WARNING', 'In scope defect', 0.7),
    ],
  };

  it('keeps the highest-severity single Out of scope finding, drops suggestions', async () => {
    const llm = new MockLLMProvider('openai', { structured: review });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, intent });
    expect(outcome.review.findings.map((x) => x.id).sort()).toEqual(['b', 'd']);
    // collapsed, not hidden: the WARNING it absorbed is listed on the signal finding
    const signal = outcome.review.findings.find((x) => x.id === 'b')!;
    expect(signal.rationale).toContain('Also out of scope (1)');
    expect(signal.rationale).toContain('[WARNING] minor thing — `src/config.ts:11`');
    expect(signal.rationale).not.toContain('nit');
    expect(outcome.assembly.intent).toContain('Summary: s');
  });

  it('does not cap without an intent', async () => {
    const llm = new MockLLMProvider('openai', { structured: review });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });
    expect(outcome.review.findings).toHaveLength(4);
  });
});

describe('reviewPullRequest — onPromptAssembled hook', () => {
  const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
  const twoFileDiff = async () => {
    const base = await new MockGitClient().diff();
    const file = base.files[0]!;
    return {
      ...base,
      files: [file, { ...file, path: 'src/other.ts' }],
    };
  };

  it('fires once in single-pass, before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();
    const seen: { calls: number; idx: number; count: number }[] = [];
    await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff, llm,
      onPromptAssembled: (p) =>
        seen.push({ calls: llm.calls.length, idx: p.chunkIndex, count: p.chunkCount }),
    });
    expect(seen).toEqual([{ calls: 0, idx: 0, count: 1 }]);
  });

  it('fires once per chunk in map-reduce, each before its LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await twoFileDiff();
    const seen: { calls: number; idx: number; count: number; label: string }[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce',
      onPromptAssembled: (p) =>
        seen.push({ calls: llm.calls.length, idx: p.chunkIndex, count: p.chunkCount, label: p.chunkLabel }),
    });
    expect(outcome.mode).toBe('map-reduce');
    expect(seen.map((x) => [x.calls, x.idx, x.count])).toEqual([
      [0, 0, 2],
      [1, 1, 2],
    ]);
    expect(seen.map((x) => x.label)).toEqual(diff.files.map((f) => f.path));
  });

  it('a throwing hook does not fail the review', async () => {
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff, llm,
      onPromptAssembled: () => {
        throw new Error('boom');
      },
    });
    expect(outcome.review.verdict).toBe('approve');
  });
});
