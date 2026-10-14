import { AppError } from '../../platform/errors.js';

/** Hard limits for project-context documents (spec C2/C3). */
export const MAX_DOC_BYTES = 512 * 1024;
export const MAX_CONTEXT_DOCS = 50;
export const MAX_DOC_PATH_LEN = 512;

/**
 * Lexical guard for a repo-relative `.md` path: relative, forward-slash,
 * no NUL, no `.`, `..` or `.git` segment, `.md` suffix, bounded length. The adapter adds a
 * realpath containment check on top (defence in depth).
 */
export function isLexicallyValidDocPath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0 || p.length > MAX_DOC_PATH_LEN) return false;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
  if (p.includes('\\') || p.includes('\0')) return false;
  if (p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '' || seg === '.git')) return false;
  return p.endsWith('.md');
}

export function validateDocPath(p: unknown): string {
  if (!isLexicallyValidDocPath(p)) {
    throw new AppError('invalid_path', 'Path must be a relative repository .md path', 422);
  }
  return p;
}

/** Validate a whole attach list: size, each path, uniqueness. */
export function validateContextDocs(list: readonly string[]): string[] {
  if (list.length > MAX_CONTEXT_DOCS) {
    throw new AppError(
      'attachment_limit',
      `At most ${MAX_CONTEXT_DOCS} documents can be attached`,
      422,
    );
  }
  const seen = new Set<string>();
  for (const p of list) {
    validateDocPath(p);
    if (seen.has(p)) throw new AppError('duplicate_path', `Duplicate path: ${p}`, 422);
    seen.add(p);
  }
  return [...list];
}
