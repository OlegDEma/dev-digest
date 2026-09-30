import { describe, it, expect } from 'vitest';
import { extractReferences, redactUrl, safeDocPath, htmlToText } from '../src/modules/intent/helpers.js';

const repo = { owner: 'acme', name: 'widgets' };

describe('extractReferences — issues', () => {
  it.each([
    'close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved',
  ])('accepts closing keyword %s', (kw) => {
    expect(extractReferences(`${kw} #12`, repo).issues).toEqual([
      { owner: 'acme', name: 'widgets', number: 12 },
    ]);
  });

  it('accepts keyword + owner/repo#N and case-insensitive keywords', () => {
    expect(extractReferences('Fixes other/lib#5', repo).issues).toEqual([
      { owner: 'other', name: 'lib', number: 5 },
    ]);
  });

  it('accepts explicit issue URLs without a keyword', () => {
    expect(extractReferences('see https://github.com/acme/widgets/issues/9.', repo).issues).toEqual([
      { owner: 'acme', name: 'widgets', number: 9 },
    ]);
  });

  it('ignores a bare #N and dedups + caps at 3', () => {
    expect(extractReferences('relates to #7 and see #8', repo).issues).toEqual([]);
    const many = extractReferences('closes #1 closes #1 fixes #2 fixes #3 fixes #4 fixes #5', repo);
    expect(many.issues.map((i) => i.number)).toEqual([1, 2, 3]);
  });
});

describe('extractReferences — docs and urls', () => {
  it('finds relative md/mdx/txt paths, normalised', () => {
    const r = extractReferences('Plan in specs/08-intent.md and ./docs/a.mdx, notes.txt', repo);
    expect(r.docs).toEqual(['specs/08-intent.md', 'docs/a.mdx', 'notes.txt']);
  });

  it('rejects .. escapes and absolute paths', () => {
    expect(extractReferences('see ../secret.md and /etc/x.md and a/../../b.md', repo).docs).toEqual([]);
    expect(safeDocPath('a/../../b.md')).toBeNull();
    expect(safeDocPath('/abs.md')).toBeNull();
  });

  it('maps a same-repo blob URL to a doc, a foreign one to a url', () => {
    const r = extractReferences(
      'https://github.com/acme/widgets/blob/main/specs/x.md and https://github.com/other/lib/blob/main/y.md',
      repo,
    );
    expect(r.docs).toEqual(['specs/x.md']);
    expect(r.urls).toEqual(['https://github.com/other/lib/blob/main/y.md']);
  });

  it('collects generic urls, deduped and capped at 3, without treating url paths as docs', () => {
    const r = extractReferences(
      'https://a.test/x https://a.test/x https://b.test/readme.md https://c.test https://d.test',
      repo,
    );
    expect(r.urls).toEqual(['https://a.test/x', 'https://b.test/readme.md', 'https://c.test']);
    expect(r.docs).toEqual([]);
  });
});

describe('redactUrl / htmlToText', () => {
  it('strips query, fragment and credentials', () => {
    expect(redactUrl('https://u:p@a.test/p?token=SECRET#frag')).toBe('https://a.test/p');
    expect(redactUrl('not a url?x=1')).toBe('not a url');
  });
  it('flattens html', () => {
    expect(htmlToText('<style>x{}</style><h1>Hi &amp; bye</h1><script>evil()</script>')).toBe('Hi & bye');
  });
});

describe('extractReferences — attribution footers', () => {
  it('ignores the "Generated with Claude Code" link but keeps real URLs', () => {
    const body = 'Plan: https://example.com/plan\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
    expect(extractReferences(body, repo).urls).toEqual(['https://example.com/plan']);
  });
});

describe('extractReferences — robustness', () => {
  it('does not throw on a malformed percent-escape in a same-repo blob URL', () => {
    const body = 'see https://github.com/acme/widgets/blob/main/a%ZZ.md';
    expect(() => extractReferences(body, repo)).not.toThrow();
    expect(extractReferences(body, repo).docs).toEqual([]);
  });
});
