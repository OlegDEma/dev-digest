import { describe, it, expect } from 'vitest';
import { slugify } from '../src/modules/_shared/slug.js';

describe('slugify', () => {
  it('collapses symbols and spaces into single dashes', () => {
    expect(slugify('Null  deref: user.name!')).toBe('null-deref-user-name');
  });
  it('strips emoji', () => {
    expect(slugify('🔥 hot path 🔥')).toBe('hot-path');
  });
  it('neutralises markup', () => {
    expect(slugify('<img src=x onerror=alert(1)>')).toBe('img-src-x-onerror-alert-1');
  });
  it('cuts to 60 chars and re-trims dashes', () => {
    const out = slugify(`${'a'.repeat(59)} bbbbbb`);
    expect(out).toBe('a'.repeat(59));
    expect(slugify('word '.repeat(30)).length).toBeLessThanOrEqual(60);
    expect(slugify('x'.repeat(80))).toHaveLength(60);
  });
  it('falls back to "case" when nothing survives', () => {
    expect(slugify('!!! 🔥')).toBe('case');
  });
});
