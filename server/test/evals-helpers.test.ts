import { describe, it, expect } from 'vitest';
import { caseNameFor, configId, sliceFileDiff } from '../src/modules/evals/helpers.js';

describe('caseNameFor (AC-4a, AC-4b)', () => {
  it('slugifies', () => {
    expect(caseNameFor('SQL injection in `query()`!', new Set())).toBe('sql-injection-in-query');
  });
  it('adds -2, -3 on a clash', () => {
    const taken = new Set<string>();
    const names = [1, 2, 3].map(() => {
      const n = caseNameFor('Same title', taken);
      taken.add(n);
      return n;
    });
    expect(names).toEqual(['same-title', 'same-title-2', 'same-title-3']);
  });
  it('stays within 60 chars including the suffix', () => {
    const title = 'a'.repeat(80);
    const taken = new Set([caseNameFor(title, new Set())]);
    const second = caseNameFor(title, taken);
    expect(second.length).toBeLessThanOrEqual(60);
    expect(second.endsWith('-2')).toBe(true);
    expect(taken.has(second)).toBe(false);
  });
});

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' one',
  '+two',
  '@@ -20,2 +21,3 @@',
  ' x',
  '+y',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
].join('\n');

describe('sliceFileDiff (AC-3a)', () => {
  it('returns one file with all its hunks and nothing else', () => {
    const s = sliceFileDiff(RAW, 'src/a.ts');
    expect(s).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(s.match(/^@@/gm)).toHaveLength(2);
    expect(s).not.toContain('src/b.ts');
  });
  it('returns the last file too', () => {
    const s = sliceFileDiff(RAW, 'src/b.ts');
    expect(s).toContain('+new');
    expect(s).not.toContain('src/a.ts');
  });
  it('returns "" for a file not in the diff', () => {
    expect(sliceFileDiff(RAW, 'src/c.ts')).toBe('');
    expect(sliceFileDiff('', 'src/a.ts')).toBe('');
  });
  it('does not match a path that merely ends with the file name', () => {
    expect(sliceFileDiff(RAW, 'a.ts')).toBe('');
  });
});

describe('configId (AC-47)', () => {
  const base = {
    agent_version: 3,
    provider: 'openai' as const,
    model: 'gpt-4o',
    system_prompt: 'p',
    strategy: 'single-pass' as const,
    skills: [{ skill_id: 's1', name: 'S', version: 1 }],
  };
  it('is stable for equal snapshots', () => {
    expect(configId(base)).toBe(configId({ ...base, skills: [{ ...base.skills[0]! }] }));
  });
  it.each([
    ['agent_version', { agent_version: 4 }],
    ['provider', { provider: 'anthropic' as const }],
    ['model', { model: 'gpt-4.1' }],
    ['system_prompt', { system_prompt: 'q' }],
    ['strategy', { strategy: 'auto' as const }],
    ['skill version', { skills: [{ skill_id: 's1', name: 'S', version: 2 }] }],
    ['skill set', { skills: [] }],
  ])('changes when %s changes', (_n, patch) => {
    expect(configId({ ...base, ...patch })).not.toBe(configId(base));
  });
});
