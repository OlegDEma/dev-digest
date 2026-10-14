import { describe, it, expect } from 'vitest';
import {
  isLexicallyValidDocPath,
  validateDocPath,
  validateContextDocs,
  MAX_CONTEXT_DOCS,
} from '../src/modules/_shared/doc-path.js';
import { AppError } from '../src/platform/errors.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};

describe('doc-path lexical guard (AC-38)', () => {
  it.each([
    ['/etc/passwd.md'],
    ['../x.md'],
    ['docs/../../x.md'],
    ['docs\\x.md'],
    ['docs/x\0.md'],
    ['docs/x.txt'],
    ['C:/x.md'],
    ['docs//x.md'],
    ['.git/x.md'],
    ['docs/.git/x.md'],
    ['docs/./a.md'],
    ['./a.md'],
    [''],
    ['a'.repeat(513) + '.md'],
  ])('refuses %j', (p) => {
    expect(isLexicallyValidDocPath(p)).toBe(false);
    expect(code(() => validateDocPath(p))).toBe('invalid_path');
  });

  it('accepts a root-level ..foo.md name', () => {
    expect(isLexicallyValidDocPath('..foo.md')).toBe(true);
  });

  it('accepts a normal relative .md path', () => {
    expect(validateDocPath('docs/specs/a.md')).toBe('docs/specs/a.md');
  });

  it('validateContextDocs: duplicate_path, attachment_limit, invalid_path', () => {
    expect(code(() => validateContextDocs(['docs/a.md', 'docs/a.md']))).toBe('duplicate_path');
    const many = Array.from({ length: MAX_CONTEXT_DOCS + 1 }, (_, i) => `docs/${i}.md`);
    expect(code(() => validateContextDocs(many))).toBe('attachment_limit');
    expect(code(() => validateContextDocs(['../x.md']))).toBe('invalid_path');
    expect(validateContextDocs(['docs/b.md', 'docs/a.md'])).toEqual(['docs/b.md', 'docs/a.md']);
  });
});
