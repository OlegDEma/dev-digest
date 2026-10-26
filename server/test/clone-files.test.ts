import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsCloneFiles } from '../src/adapters/clone-files/index.js';

let root: string;
let outside: string;
const files = new FsCloneFiles();

async function put(rel: string, text: string | Buffer) {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, text);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cf-root-'));
  outside = await mkdtemp(join(tmpdir(), 'cf-out-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsCloneFiles', () => {
  it('rootExists is false for a missing root and true for a directory', async () => {
    expect(await files.rootExists(root)).toBe(true);
    expect(await files.rootExists(join(root, 'nope'))).toBe(false);
  });

  it('listChildDirs is sorted and skips .git, node_modules, files and symlinks', async () => {
    await put('b/x.txt', 'x');
    await put('a/x.txt', 'x');
    await put('.git/HEAD', 'x');
    await put('node_modules/p/i.js', 'x');
    await put('file.txt', 'x');
    await symlink(outside, join(root, 'link'));
    expect(await files.listChildDirs(root)).toEqual(['a', 'b']);
    expect(await files.listChildDirs(join(root, 'missing'))).toEqual([]);
  });

  it('readText returns text of a regular file', async () => {
    await put('package.json', '{"name":"x"}');
    const r = await files.readText(root, 'package.json', 1024);
    expect(r).toMatchObject({ kind: 'ok', text: '{"name":"x"}' });
  });

  it('readText: a symlink to a file outside the root is outside_repo', async () => {
    await writeFile(join(outside, 'package.json'), '{"name":"evil"}');
    await symlink(join(outside, 'package.json'), join(root, 'package.json'));
    expect(await files.readText(root, 'package.json', 1024)).toEqual({ kind: 'outside_repo' });
    expect(await files.fileExists(root, 'package.json')).toBe('outside_repo');
  });

  it('readText: a symlink resolving inside the root is followed', async () => {
    await put('real/package.json', '{"name":"in"}');
    await symlink(join(root, 'real', 'package.json'), join(root, 'package.json'));
    expect(await files.readText(root, 'package.json', 1024)).toMatchObject({ kind: 'ok' });
  });

  it('readText: lexical escapes are outside_repo', async () => {
    await writeFile(join(outside, 'x.json'), '{}');
    expect(await files.readText(root, '../x.json', 1024)).toEqual({ kind: 'outside_repo' });
    expect(await files.readText(root, join(outside, 'x.json'), 1024)).toEqual({ kind: 'outside_repo' });
  });

  it('readText: over the byte cap is too_large; non-UTF-8 is unreadable; missing is not_found', async () => {
    await put('big.json', 'x'.repeat(600 * 1024));
    expect(await files.readText(root, 'big.json', 512 * 1024)).toMatchObject({ kind: 'too_large' });
    await put('bin.json', Buffer.from([0xff, 0xfe, 0xfd]));
    expect(await files.readText(root, 'bin.json', 1024)).toEqual({ kind: 'unreadable' });
    expect(await files.readText(root, 'gone.json', 1024)).toEqual({ kind: 'not_found' });
  });

  it('readText refuses .env and .env.* (also via a symlink) without reading them', async () => {
    await put('.env', 'SECRET=ENV-SENTINEL');
    await put('.env.local', 'SECRET=ENV-SENTINEL');
    await put('sub/.env.production', 'SECRET=ENV-SENTINEL');
    await symlink(join(root, '.env'), join(root, 'package.json'));
    for (const p of ['.env', '.env.local', 'sub/.env.production', 'package.json']) {
      const r = await files.readText(root, p, 1024);
      expect(r.kind).toBe('unreadable');
      expect(JSON.stringify(r)).not.toContain('ENV-SENTINEL');
    }
  });

  it('never reaches .git internals, directly or via a committed symlink (token in .git/config)', async () => {
    await put('.git/config', 'url = https://x-access-token:TOKEN-SENTINEL@github.com/o/r.git');
    await symlink(join(root, '.git', 'config'), join(root, 'README.md'));
    for (const p of ['.git/config', 'README.md']) {
      const r = await files.readText(root, p, 1024);
      expect(r.kind).toBe('outside_repo');
      expect(JSON.stringify(r)).not.toContain('TOKEN-SENTINEL');
      expect(await files.fileExists(root, p)).toBe('outside_repo');
    }
  });

  it('fileExists reports .env.example as a file, a missing file as missing, a dir as missing', async () => {
    await put('.env.example', 'KEY=');
    await put('dir/a.txt', 'x');
    expect(await files.fileExists(root, '.env.example')).toBe('file');
    expect(await files.fileExists(root, 'nope')).toBe('missing');
    expect(await files.fileExists(root, 'dir')).toBe('missing');
  });
});
