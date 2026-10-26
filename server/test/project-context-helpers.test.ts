import { describe, it, expect } from 'vitest';
import {
  docBucketOf,
  orderContextPaths,
  usedByCounts,
  formatContextLogLines,
  toDiscovered,
} from '../src/modules/project-context/helpers.js';
import { EstimateCache, estimateCacheKey } from '../src/modules/project-context/estimate-cache.js';

const B = ['specs', 'docs', 'insights'];

describe('docBucketOf (AC-3, EC-4)', () => {
  it('returns the OUTERMOST bucket segment', () => {
    expect(docBucketOf('docs/specs/a.md', B)).toBe('docs');
    expect(docBucketOf('specs/docs/a.md', B)).toBe('specs');
    expect(docBucketOf('pkg/insights/x/a.md', B)).toBe('insights');
  });
  it('is case-insensitive and returns the lowercase bucket', () => {
    expect(docBucketOf('Specs/x.md', B)).toBe('specs');
    expect(docBucketOf('pkg/DOCS/x.md', B)).toBe('docs');
  });
  it('ignores the filename and non-bucket folders', () => {
    expect(docBucketOf('src/docs.md', B)).toBeNull();
    expect(docBucketOf('docs.md', B)).toBeNull();
  });
});

describe('toDiscovered', () => {
  it('splits folder and name', () => {
    expect(toDiscovered({ path: 'docs/a/b.md', sizeBytes: 3 }, 'docs', 'ok', 5, 2)).toEqual({
      path: 'docs/a/b.md',
      folder: 'docs/a',
      name: 'b.md',
      bucket: 'docs',
      size_bytes: 3,
      status: 'ok',
      estimated_tokens: 5,
      used_by_agents: 2,
    });
  });
});

describe('usedByCounts (AC-11)', () => {
  it('counts distinct agents (direct + via skill collapse to one agent)', () => {
    const m = usedByCounts([
      { agentId: 'a1', docs: ['docs/x.md'] },
      { agentId: 'a1', docs: ['docs/x.md', 'docs/y.md'] },
      { agentId: 'a2', docs: ['docs/x.md'] },
    ]);
    expect(m.get('docs/x.md')).toBe(2);
    expect(m.get('docs/y.md')).toBe(1);
    expect(m.get('docs/none.md')).toBeUndefined();
  });
});

describe('orderContextPaths (AC-24, AC-25, EC-10, EC-11)', () => {
  it('agent first, then skills in binding order, first occurrence wins', () => {
    expect(
      orderContextPaths(['docs/a.md', 'docs/b.md'], [['docs/c.md', 'docs/a.md'], ['docs/d.md', 'docs/c.md']]),
    ).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']);
  });
  it('empty inputs', () => {
    expect(orderContextPaths([], [])).toEqual([]);
    expect(orderContextPaths([], [[], ['docs/a.md']])).toEqual(['docs/a.md']);
  });
});

describe('formatContextLogLines (AC-36)', () => {
  it('exact C5 strings', () => {
    expect(
      formatContextLogLines([
        { path: 'specs/a.md', status: 'injected', reason: null, tokens: 12 },
        { path: 'docs/gone.md', status: 'skipped', reason: 'not_found', tokens: null },
        { path: 'docs/b.md', status: 'injected', reason: null, tokens: 8 },
      ]),
    ).toEqual([
      'project context: "specs/a.md" attached (~12 tokens)',
      'project context: skipped "docs/gone.md" (not_found)',
      'project context: "docs/b.md" attached (~8 tokens)',
      'project context: 2 attached — ~20 tokens added to the prompt',
    ]);
  });
  it('none attached', () => {
    expect(formatContextLogLines([])).toEqual(['project context: none attached']);
    expect(
      formatContextLogLines([{ path: 'a.md', status: 'skipped', reason: 'no_clone', tokens: null }]),
    ).toEqual(['project context: skipped "a.md" (no_clone)', 'project context: none attached']);
  });
});

describe('estimate cache key (D12)', () => {
  it('changes with size or mtime', () => {
    const k = estimateCacheKey('/r', 'docs/a.md', 10, 1);
    expect(estimateCacheKey('/r', 'docs/a.md', 11, 1)).not.toBe(k);
    expect(estimateCacheKey('/r', 'docs/a.md', 10, 2)).not.toBe(k);
    const c = new EstimateCache();
    c.set(k, { status: 'ok', tokens: 3 });
    expect(c.get(k)).toEqual({ status: 'ok', tokens: 3 });
    expect(c.get(estimateCacheKey('/r', 'docs/a.md', 10, 2))).toBeUndefined();
  });
});
