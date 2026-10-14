import { readdir, stat, lstat, realpath, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute, basename, normalize, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { simpleGit } from 'simple-git';
import type {
  CloneDocs,
  CloneDocEntry,
  CloneDocRead,
  CloneDocWrite,
} from '@devdigest/shared';
import { isLexicallyValidDocPath } from '../../modules/_shared/doc-path.js';

/**
 * Filesystem-backed `CloneDocs` port: the ONLY place that reads or writes
 * project-context markdown inside a repo clone. Every access is lexically
 * checked and then realpath-contained in the clone root. Only `isTracked`
 * spawns git.
 */
export class FsCloneDocs implements CloneDocs {
  async discover(
    root: string,
    opts: { buckets: readonly string[]; excludedDirs: readonly string[] },
  ): Promise<CloneDocEntry[] | null> {
    try {
      if (!(await stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }
    const buckets = new Set(opts.buckets);
    const excluded = new Set(opts.excludedDirs);
    const out: CloneDocEntry[] = [];

    const walk = async (rel: string, inBucket: boolean): Promise<void> => {
      let entries;
      try {
        entries = await readdir(rel ? join(root, rel) : root, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (excluded.has(e.name)) continue;
          await walk(childRel, inBucket || buckets.has(e.name.toLowerCase()));
        } else if (e.isFile() && inBucket && e.name.endsWith('.md')) {
          try {
            const st = await stat(join(root, childRel));
            out.push({ path: childRel, sizeBytes: st.size, mtimeMs: st.mtimeMs });
          } catch {
            /* vanished mid-walk */
          }
        }
      }
    };
    await walk('', false);
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }

  /** Resolve `path` inside `root`; null when it escapes or cannot be resolved. */
  private async contain(
    root: string,
    path: string,
  ): Promise<{ kind: 'ok'; real: string } | { kind: 'not_found' | 'outside_repo' }> {
    if (!isLexicallyValidDocPath(path)) return { kind: 'outside_repo' };
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return { kind: 'not_found' };
    }
    let real: string;
    try {
      real = await realpath(join(realRoot, path));
    } catch {
      return { kind: 'not_found' };
    }
    const rel = relative(realRoot, real);
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      return { kind: 'outside_repo' };
    }
    // Any symlink (final or intermediate) makes the resolved path differ from
    // the lexical join: refuse it, so a committed link can never reach .git/config
    // or another non-.md file. The resolved target must itself be a non-.git .md.
    if (real !== join(realRoot, normalize(path))) return { kind: 'outside_repo' };
    if (!real.endsWith('.md') || rel.split(sep).includes('.git')) return { kind: 'outside_repo' };
    return { kind: 'ok', real };
  }

  async read(root: string, path: string, maxBytes: number): Promise<CloneDocRead> {
    const c = await this.contain(root, path);
    if (c.kind !== 'ok') return { kind: c.kind };
    try {
      const st = await stat(c.real);
      if (!st.isFile()) return { kind: 'not_found' };
      if (st.size > maxBytes) return { kind: 'too_large', sizeBytes: st.size };
      const buf = await readFile(c.real);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        return { kind: 'unreadable' };
      }
      return { kind: 'ok', text, sizeBytes: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return { kind: 'unreadable' };
    }
  }

  async write(root: string, path: string, text: string): Promise<CloneDocWrite> {
    const c = await this.contain(root, path);
    if (c.kind !== 'ok') return c.kind;
    const tmp = join(dirname(c.real), `.${basename(c.real)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const st = await lstat(c.real);
      if (!st.isFile()) return 'not_found';
      await writeFile(tmp, text, { encoding: 'utf8', mode: st.mode & 0o777, flag: 'wx' });
      await rename(tmp, c.real);
      return 'ok';
    } catch {
      await rm(tmp, { force: true }).catch(() => {});
      return 'write_failed';
    }
  }

  async isTracked(root: string, path: string): Promise<boolean> {
    if (!isLexicallyValidDocPath(path)) return false;
    try {
      await simpleGit(root).raw(['ls-files', '--error-unmatch', '--', path]);
      return true;
    } catch {
      return false;
    }
  }
}
