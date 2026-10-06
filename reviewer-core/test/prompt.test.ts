/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — PR intent slot', () => {
  const intentText = 'Summary: add rate limiting';

  it('renders the untrusted intent block before the diff and records assembly.intent', () => {
    const { messages, assembly } = assemblePrompt({ system: 'S', diff: 'DIFF', intent: intentText });
    const user = messages[1]!.content;
    const i = user.indexOf('## PR intent (derived — untrusted)');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(user.indexOf('## Diff to review'));
    expect(user).toContain('<untrusted source="pr-intent">');
    expect(assembly.intent).toBe(intentText);
  });

  it('omits the section when absent', () => {
    const { messages, assembly } = assemblePrompt({ system: 'S', diff: 'DIFF' });
    expect(messages[1]!.content).not.toContain('PR intent');
    expect(assembly.intent).toBeNull();
  });

  it('guard still forbids descoping a real defect to zero findings', () => {
    expect(systemOf({ system: 'S', diff: 'D' })).toMatch(/can never turn a real defect into zero findings/);
  });
});

describe('assemblePrompt — sections', () => {
  const full = {
    system: 'SYS',
    task: 'Review PR #1',
    prDescription: 'body',
    skills: ['### a\nA', '### b\nB'],
    memory: ['m1', 'm2', 'm3'],
    repoMap: 'map',
    specs: ['s1'],
    callers: 'callers',
    intent: 'Summary: x',
    diff: 'DIFF',
  };
  const minimal = { system: 'SYS', diff: 'DIFF' };

  it('lists every section in render order with item counts', () => {
    const { sections } = assemblePrompt(full);
    expect(sections.map((s) => s.name)).toEqual([
      'system', 'task', 'pr_description', 'skills', 'memory', 'repo_map', 'specs', 'callers', 'intent', 'diff',
    ]);
    const items = Object.fromEntries(sections.map((s) => [s.name, s.items]));
    expect(items).toMatchObject({ skills: 2, memory: 3, specs: 1, diff: 1, system: 1 });
  });

  it('minimal input has only system + diff', () => {
    expect(assemblePrompt(minimal).sections.map((s) => s.name)).toEqual(['system', 'diff']);
  });

  it.each([['full', full], ['minimal', minimal]])(
    'sections describe exactly what is sent (%s)',
    (_n, parts) => {
      const { messages, sections, assembly } = assemblePrompt(parts);
      expect(messages[0]!.content).toBe(sections[0]!.text);
      expect(messages[1]!.content).toBe(sections.slice(1).map((s) => s.text).join('\n\n'));
      expect(assembly.user).toBe(messages[1]!.content);
    },
  );
});
