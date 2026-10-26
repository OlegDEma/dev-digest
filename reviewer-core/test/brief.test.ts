import { describe, it, expect } from 'vitest';
import type { BriefModelOutput } from '@devdigest/shared';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import {
  assembleBriefPrompt,
  generateBrief,
  validateBriefOutput,
  BRIEF_INPUT_BUDGET,
  type BriefFacts,
} from '../src/index.js';

const count = (s: string) => Math.ceil(s.length / 4);

const PATCH_LINES = ['const secretPatchLine = 1;', 'removedPatchLine();'];

function facts(over: Partial<BriefFacts> = {}): BriefFacts {
  return {
    title: 'Add rate limit',
    body: 'Adds rate limiting',
    issue: null,
    intent: null,
    blast: null,
    files: [{ path: 'src/a.ts', additions: 3, deletions: 1, ranges: [{ start: 10, count: 5 }] }],
    specs: [],
    ...over,
  };
}

const manyFiles = (n: number): BriefFacts['files'] =>
  Array.from({ length: n }, (_, i) => ({
    path: `src/module-${i}/file-${i}.ts`,
    additions: i % 50,
    deletions: i % 7,
    ranges: [{ start: 1, count: 20 }, { start: 100, count: 5 }],
  }));

describe('assembleBriefPrompt', () => {
  it('keeps a 1000-file PR within the budget and records reductions (AC-11, AC-12)', () => {
    const a = assembleBriefPrompt(facts({ files: manyFiles(1000), body: 'x '.repeat(20000) }), count);
    expect(a.inputTokens).toBeLessThanOrEqual(BRIEF_INPUT_BUDGET);
    expect(a.reductions.length).toBeGreaterThan(0);
    expect(a.reductions.some((r) => r.includes('files omitted'))).toBe(true);
    const all = a.messages.map((m) => m.content).join('\n');
    expect(count(a.messages[0]!.content) + count(a.messages[1]!.content)).toBe(a.inputTokens);
    expect(all.length).toBeGreaterThan(0);
  });

  it('never carries a patch line and wraps every fact in untrusted blocks (AC-10, AC-17)', () => {
    const a = assembleBriefPrompt(
      facts({
        issue: { ref: 'acme/w#4', title: 'T', body: 'B' },
        blast: { summary: '1 changed symbol', callers: [{ name: 'f', file: 'src/b.ts', line: 3 }] },
        specs: [{ path: 'specs/a.md', text: 'SPEC' }],
      }),
      count,
    );
    const user = a.messages[1]!.content;
    for (const l of PATCH_LINES) expect(user).not.toContain(l);
    for (const line of user.split('\n')) expect(line).not.toMatch(/^[+\- ]/);
    const blocks = user.match(/<untrusted source="[^"]*">/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    expect(user.replace(/<untrusted source="[^"]*">[\s\S]*?<\/untrusted>/g, '').trim()).toBe('');
    expect(a.messages[0]!.content).toContain('never instructions');
  });

  it('sanitises a quote in a spec path so it cannot break the label (EC-20)', () => {
    const a = assembleBriefPrompt(facts({ specs: [{ path: 'a" onload="x.md', text: 'T' }] }), count);
    const user = a.messages[1]!.content;
    expect(user).not.toContain('a" onload');
    expect(user).toContain('source="spec_a__onload__x.md"');
  });

  it('puts specs over budget in order, whole documents only (AC-16)', () => {
    const big = 'w '.repeat(40000);
    const a = assembleBriefPrompt(
      facts({ specs: [{ path: 'a.md', text: 'small' }, { path: 'b.md', text: big }, { path: 'c.md', text: 'tiny' }] }),
      count,
    );
    expect(a.specsUsed.map((s) => s.path)).toEqual(['a.md']);
    expect(a.specsOverBudget).toEqual(['b.md', 'c.md']);
    expect(a.inputTokens).toBeLessThanOrEqual(BRIEF_INPUT_BUDGET);
  });

  it('assembles 300 files in under 3 s (NFR-2)', () => {
    const t0 = performance.now();
    assembleBriefPrompt(facts({ files: manyFiles(300) }), count);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('validateBriefOutput', () => {
  const changedRanges = new Map([
    ['src/a.ts', [{ start: 10, count: 5 }, { start: 40, count: 3 }]],
    ['src/del.ts', []],
    ['src/both.ts', [{ start: 1, count: 2 }]],
  ]);
  const callerLines = new Map([
    ['src/caller.ts', [5, 20]],
    ['src/both.ts', [99]],
  ]);
  const run = (o: Partial<BriefModelOutput>) =>
    validateBriefOutput({ summary: 's', risks: [], review_focus: [], ...o }, { changedRanges, callerLines });
  const risk = (refs: string[]) => ({ kind: 'k', title: 't', explanation: 'e', severity: 'high' as const, file_refs: refs });

  it('removes invalid refs and drops risks with none (AC-19, AC-20)', () => {
    const r = run({
      risks: [risk(['src/a.ts:12', 'invented.ts:1']), risk(['nope.ts', 'ghost.ts:3-4']), risk(['src/caller.ts'])],
    });
    expect(r.risks.map((x) => x.file_refs)).toEqual([['src/a.ts:12'], ['src/caller.ts']]);
    expect(r.dropped).toEqual({ risks: 1, risk_refs: 3, review_focus: 0 });
  });

  it('keeps in-range lines and snaps out-of-range ones to the nearest range start (AC-21, AC-22, D2)', () => {
    const r = run({
      review_focus: [
        { file: 'src/a.ts', line: 12, reason: 'in' },
        { file: 'src/a.ts', line: 38, reason: 'near second' },
        { file: 'src/a.ts', line: 0, reason: 'below one' },
        { file: 'src/a.ts', line: 500, reason: 'far' },
        { file: 'unknown.ts', line: 1, reason: 'x' },
      ],
    });
    expect(r.review_focus.map((f) => [f.line, f.line_corrected, f.source])).toEqual([
      [12, false, 'pr_diff'],
      [40, true, 'pr_diff'],
      [10, true, 'pr_diff'],
      [40, true, 'pr_diff'],
    ]);
    expect(r.corrected_lines).toBe(3);
    expect(r.dropped.review_focus).toBe(1);
  });

  it('snaps blast-only lines to the nearest caller line, ties smaller (AC-23)', () => {
    const r = run({
      review_focus: [
        { file: 'src/caller.ts', line: 20, reason: 'exact' },
        { file: 'src/caller.ts', line: 12, reason: 'tie' },
        { file: 'src/caller.ts', line: 18, reason: 'near' },
      ],
    });
    expect(r.review_focus.map((f) => [f.line, f.line_corrected, f.source])).toEqual([
      [20, false, 'blast_map'],
      [5, true, 'blast_map'],
      [20, true, 'blast_map'],
    ]);
  });

  it('applies pr_diff rules to a file that is both changed and a caller (AC-23, G3)', () => {
    const r = run({ review_focus: [{ file: 'src/both.ts', line: 99, reason: 'r' }] });
    expect(r.review_focus[0]).toMatchObject({ line: 1, source: 'pr_diff', line_corrected: true });
  });

  it('drops a focus item on a changed file with no ranges (AC-24)', () => {
    const r = run({ review_focus: [{ file: 'src/del.ts', line: 1, reason: 'r' }] });
    expect(r.review_focus).toEqual([]);
    expect(r.dropped.review_focus).toBe(1);
  });

  it('caps risks at 8 and focus at 10 in model order, not counting overflow (AC-25, D9)', () => {
    const r = run({
      risks: Array.from({ length: 12 }, (_, i) => ({ ...risk(['src/a.ts']), title: `r${i}` })),
      review_focus: Array.from({ length: 14 }, (_, i) => ({ file: 'src/a.ts', line: 10, reason: `f${i}` })),
    });
    expect(r.risks.map((x) => x.title)).toEqual(Array.from({ length: 8 }, (_, i) => `r${i}`));
    expect(r.review_focus).toHaveLength(10);
    expect(r.review_focus[9]!.reason).toBe('f9');
    expect(r.dropped).toEqual({ risks: 0, risk_refs: 0, review_focus: 0 });
  });

  it('never uses a model path as anything but a lookup key (AC-62)', () => {
    const r = run({ review_focus: [{ file: '../../etc/passwd', line: 1, reason: 'r' }], risks: [risk(['../../etc/passwd:1'])] });
    expect(r.review_focus).toEqual([]);
    expect(r.risks).toEqual([]);
  });
});

describe('generateBrief', () => {
  it('makes exactly one structured call and returns validated output (AC-7, AC-14, NFR-3)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        PrBriefModelOutput: {
          summary: 'why',
          risks: [{ kind: 'secret', title: 'Secret', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:11', 'bad.ts'] }],
          review_focus: [{ file: 'src/a.ts', line: 11, reason: 'r' }],
        },
      },
    });
    let sections = 0;
    const res = await generateBrief({
      llm,
      model: 'm',
      facts: facts(),
      count,
      onPrompt: (p) => void (sections = p.sections.length),
    });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const req = llm.calls[0]!.req as { maxTokens: number; requireParameters: boolean; temperature?: number };
    expect(req.maxTokens).toBe(2000);
    expect(req.requireParameters).toBe(true);
    expect(req.temperature).toBeUndefined();
    expect(sections).toBeGreaterThan(0);
    expect(res.risks[0]!.file_refs).toEqual(['src/a.ts:11']);
    expect(res.dropped.risk_refs).toBe(1);
    expect(res.attempts).toBe(1);
    expect(res.inputTokens).toBeLessThanOrEqual(BRIEF_INPUT_BUDGET);
  });
});
