import { readdir, stat, realpath, readFile } from 'node:fs/promises';
import { join, relative, isAbsolute, basename, sep } from 'node:path';
import type { CloneFiles, CloneDocRead } from '@devdigest/shared';

/** `.env` and `.env.*` hold secrets: never opened, whatever the caller asks for. */
const ENV_FILE = /^\.env(\..*)?$/;
const SKIPPED_DIRS = new Set(['.git', 'node_modules']);

type Contained = { kind: 'ok'; real: string } | { kind: 'missing' | 'outside_repo' };

function lexicallyValid(path: string): boolean {
  if (!path || path.includes('\0') || isAbsolute(path)) return false;
  return !path.split(/[\\/]/).includes('..');
}

/**
 * Filesystem-backed `CloneFiles` port: read-only probes inside a repo clone for
 * the onboarding generator. Every path is lexically checked, then realpath-contained
 * in the clone root (symlinks are followed; a target outside the root is refused).
 */
export class FsCloneFiles implements CloneFiles {
  async rootExists(root: string): Promise<boolean> {
    try {
      return (await stat(root)).isDirectory();
    } catch {
      return false;
    }
  }

  async listChildDirs(root: string): Promise<string[]> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !SKIPPED_DIRS.has(e.name))
        .map((e) => e.name)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    } catch {
      return [];
    }
  }

  private async contain(root: string, path: string): Promise<Contained> {
    if (!lexicallyValid(path)) return { kind: 'outside_repo' };
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return { kind: 'missing' };
    }
    let real: string;
    try {
      real = await realpath(join(realRoot, path));
    } catch {
      return { kind: 'missing' };
    }
    const rel = relative(realRoot, real);
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      return { kind: 'outside_repo' };
    }
    // .git/config holds the clone's token-bearing remote URL: a committed symlink
    // (e.g. README.md -> .git/config) must never reach it, nor may a direct path.
    if (rel.split(sep).includes('.git') || path.split(/[\\/]/).includes('.git')) {
      return { kind: 'outside_repo' };
    }
    return { kind: 'ok', real };
  }

  async fileExists(root: string, path: string): Promise<'file' | 'missing' | 'outside_repo'> {
    const c = await this.contain(root, path);
    if (c.kind !== 'ok') return c.kind;
    try {
      return (await stat(c.real)).isFile() ? 'file' : 'missing';
    } catch {
      return 'missing';
    }
  }

  async readText(root: string, path: string, maxBytes: number): Promise<CloneDocRead> {
    if (ENV_FILE.test(basename(path))) return { kind: 'unreadable' };
    const c = await this.contain(root, path);
    if (c.kind !== 'ok') return { kind: c.kind === 'missing' ? 'not_found' : 'outside_repo' };
    // A symlink named like a manifest may resolve to an env file.
    if (ENV_FILE.test(basename(c.real))) return { kind: 'unreadable' };
    try {
      const st = await stat(c.real);
      if (!st.isFile()) return { kind: 'not_found' };
      if (st.size > maxBytes) return { kind: 'too_large', sizeBytes: st.size };
      const buf = await readFile(c.real);
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return { kind: 'ok', text, sizeBytes: st.size, mtimeMs: st.mtimeMs };
      } catch {
        return { kind: 'unreadable' };
      }
    } catch {
      return { kind: 'unreadable' };
    }
  }
}
