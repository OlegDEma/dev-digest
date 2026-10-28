import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raw = vi.fn();
vi.mock('simple-git', () => ({ simpleGit: vi.fn(() => ({ raw })) }));

import { simpleGit } from 'simple-git';
import { FsCloneDocs } from '../src/adapters/clone-docs/index.js';

const OPTS = { buckets: ['specs', 'docs', 'insights'], excludedDirs: ['node_modules', 'vendor', 'dist', '.git'] };
let root: string;
let outside: string;
const docs = new FsCloneDocs();

async function put(rel: string, text: string | Buffer) {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, text);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cd-root-'));
  outside = await mkdtemp(join(tmpdir(), 'cd-out-'));
  raw.mockReset();
  vi.mocked(simpleGit).mockClear();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsCloneDocs.discover (AC-1, AC-8)', () => {
  it('lists only .md under a bucket folder at any depth, excluded dirs skipped, sorted, symlinks skipped', async () => {
    await put('docs/b.md', 'b');
    await put('docs/a.md', 'a');
    await put('docs/specs/x.md', 'x');
    await put('packages/app/specs/y.md', 'y');
    await put('src/readme.md', 'no bucket');
    await put('docs/note.txt', 'txt');
    await put('node_modules/pkg/docs/x.md', 'nm');
    await put('docs/vendor/z.md', 'v');
    await put('README.md', 'top');
    await writeFile(join(outside, 'leak.md'), 'leak');
    await symlink(join(outside, 'leak.md'), join(root, 'docs/link.md'));
    await symlink(outside, join(root, 'docs/linkdir'));
    const res = await docs.discover(root, OPTS);
    expect(res!.map((e) => e.path)).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/specs/x.md',
      'packages/app/specs/y.md',
    ]);
    expect(res![0]).toMatchObject({ sizeBytes: 1 });
    expect(typeof res![0]!.mtimeMs).toBe('number');
  });

  it('honours a different bucket set (AC-2)', async () => {
    await put('docs/a.md', 'a');
    await put('adr/b.md', 'b');
    const res = await docs.discover(root, { ...OPTS, buckets: ['adr'] });
    expect(res!.map((e) => e.path)).toEqual(['adr/b.md']);
  });

  it('matches bucket folders case-insensitively (W6)', async () => {
    await put('Docs/a.md', 'a');
    await put('ADR/b.md', 'b');
    await put('Other/c.md', 'c');
    const res = await docs.discover(root, { ...OPTS, buckets: ['docs', 'adr'] });
    expect(res!.map((e) => e.path)).toEqual(['ADR/b.md', 'Docs/a.md']);
  });

  it('returns null for a missing root', async () => {
    expect(await docs.discover(join(root, 'nope'), OPTS)).toBeNull();
  });

  it('never spawns git', async () => {
    await put('docs/a.md', 'a');
    await docs.discover(root, OPTS);
    expect(simpleGit).not.toHaveBeenCalled();
  });
});

describe('FsCloneDocs.read (AC-7, AC-38)', () => {
  it('reads ok text', async () => {
    await put('docs/a.md', 'héllo');
    const r = await docs.read(root, 'docs/a.md', 1024);
    expect(r).toMatchObject({ kind: 'ok', text: 'héllo' });
  });
  it('lexically bad path -> outside_repo', async () => {
    expect((await docs.read(root, '../../etc/passwd', 1024)).kind).toBe('outside_repo');
  });
  it('out-of-tree symlink -> outside_repo', async () => {
    await writeFile(join(outside, 'leak.md'), 'leak');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'leak.md'), join(root, 'docs/link.md'));
    expect((await docs.read(root, 'docs/link.md', 1024)).kind).toBe('outside_repo');
  });
  it('too large', async () => {
    await put('docs/big.md', 'x'.repeat(100));
    expect(await docs.read(root, 'docs/big.md', 10)).toEqual({ kind: 'too_large', sizeBytes: 100 });
  });
  it('invalid UTF-8 -> unreadable', async () => {
    await put('docs/bad.md', Buffer.from([0xff, 0xfe, 0xfd]));
    expect((await docs.read(root, 'docs/bad.md', 1024)).kind).toBe('unreadable');
  });
  it('missing -> not_found', async () => {
    expect((await docs.read(root, 'docs/none.md', 1024)).kind).toBe('not_found');
  });
  it('never spawns git', async () => {
    await put('docs/a.md', 'a');
    await docs.read(root, 'docs/a.md', 1024);
    expect(simpleGit).not.toHaveBeenCalled();
  });
});

describe('FsCloneDocs.write (AC-42)', () => {
  it('replaces content atomically and leaves no tmp file', async () => {
    await put('docs/a.md', 'old');
    expect(await docs.write(root, 'docs/a.md', 'new')).toBe('ok');
    expect(await readFile(join(root, 'docs/a.md'), 'utf8')).toBe('new');
    expect(await readdir(join(root, 'docs'))).toEqual(['a.md']);
    expect(simpleGit).not.toHaveBeenCalled();
  });
  it('refuses a missing file (never creates)', async () => {
    await mkdir(join(root, 'docs'), { recursive: true });
    expect(await docs.write(root, 'docs/new.md', 'x')).toBe('not_found');
    expect(await readdir(join(root, 'docs'))).toEqual([]);
  });
  it('refuses an out-of-tree symlink and leaves the target alone', async () => {
    await writeFile(join(outside, 'leak.md'), 'orig');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'leak.md'), join(root, 'docs/link.md'));
    expect(await docs.write(root, 'docs/link.md', 'pwn')).toBe('outside_repo');
    expect(await readFile(join(outside, 'leak.md'), 'utf8')).toBe('orig');
  });
  it('refuses an in-tree symlink to another .md (resolved path must equal the lexical path)', async () => {
    await put('docs/real.md', 'old');
    await symlink(join(root, 'docs/real.md'), join(root, 'docs/alias.md'));
    expect(await docs.write(root, 'docs/alias.md', 'new')).toBe('outside_repo');
    expect(await readFile(join(root, 'docs/real.md'), 'utf8')).toBe('old');
  });
});

describe('symlink and .git hardening (SEC-1)', () => {
  async function gitConfig() {
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, '.git/config'), '[remote "origin"] url = https://tok@example.com/x.git');
    await mkdir(join(root, 'docs'), { recursive: true });
  }
  it('symlinked .md -> .git/config: refused for read AND write, file unchanged', async () => {
    await gitConfig();
    await symlink(join(root, '.git/config'), join(root, 'docs/x.md'));
    expect((await docs.read(root, 'docs/x.md', 1024)).kind).toBe('outside_repo');
    expect(await docs.write(root, 'docs/x.md', 'pwn')).toBe('outside_repo');
    expect(await readFile(join(root, '.git/config'), 'utf8')).toContain('tok@example.com');
  });
  it('symlinked .md -> a non-.md in-repo file is refused', async () => {
    await put('docs/real.txt', 'plain');
    await symlink(join(root, 'docs/real.txt'), join(root, 'docs/x.md'));
    expect((await docs.read(root, 'docs/x.md', 1024)).kind).toBe('outside_repo');
    expect(await docs.write(root, 'docs/x.md', 'pwn')).toBe('outside_repo');
    expect(await readFile(join(root, 'docs/real.txt'), 'utf8')).toBe('plain');
  });
  it('an intermediate directory symlink is refused', async () => {
    await put('real/inner.md', 'inner');
    await symlink(join(root, 'real'), join(root, 'docs'));
    expect((await docs.read(root, 'docs/inner.md', 1024)).kind).toBe('outside_repo');
    expect(await docs.write(root, 'docs/inner.md', 'pwn')).toBe('outside_repo');
    expect(await readFile(join(root, 'real/inner.md'), 'utf8')).toBe('inner');
  });
  it('.git/x.md is refused', async () => {
    await put('.git/x.md', 'secret');
    expect((await docs.read(root, '.git/x.md', 1024)).kind).toBe('outside_repo');
    expect(await docs.write(root, '.git/x.md', 'pwn')).toBe('outside_repo');
    expect(await readFile(join(root, '.git/x.md'), 'utf8')).toBe('secret');
  });
  it('a root-level "..foo.md" is a normal file, not an escape', async () => {
    await put('..foo.md', 'dots');
    expect(await docs.read(root, '..foo.md', 1024)).toMatchObject({ kind: 'ok', text: 'dots' });
    expect(await docs.write(root, '..foo.md', 'edited')).toBe('ok');
  });
});

describe('FsCloneDocs.isTracked (AC-43)', () => {
  it('is the only method that calls git, argv-hardened', async () => {
    raw.mockResolvedValueOnce('docs/a.md');
    expect(await docs.isTracked(root, 'docs/a.md')).toBe(true);
    expect(raw).toHaveBeenCalledWith(['ls-files', '--error-unmatch', '--', 'docs/a.md']);
    raw.mockRejectedValueOnce(new Error('not tracked'));
    expect(await docs.isTracked(root, 'docs/b.md')).toBe(false);
    expect(await docs.isTracked(root, '-x.md/../y.md')).toBe(false);
  });
});
