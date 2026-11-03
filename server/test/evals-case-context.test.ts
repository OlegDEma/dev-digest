import { describe, it, expect } from 'vitest';
import { EVAL_INPUT_LIMITS } from '@devdigest/shared';
import {
  buildCaseContext,
  compareCodePoints,
  contextLogFields,
  stemOf,
  truncateChars,
} from '../src/modules/evals/case-context.js';
import { sliceFileDiff } from '../src/modules/evals/helpers.js';

const sec = (path: string, body = '@@ -1 +1 @@\n-a\n+b\n') =>
  `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n${body}`;

const PULL = { title: 'T', body: 'B', filesCount: 0 };

function build(raw: string, findingFile: string, pull = PULL) {
  return buildCaseContext({ raw, findingFile, findingSection: sliceFileDiff(raw, findingFile), pull });
}
const paths = (r: ReturnType<typeof build>) => r.inputFiles.map((f) => f.path);

describe('buildCaseContext', () => {
  it('u1 excludes the finding file; works for both kinds (pure on raw)', () => {
    const raw = sec('src/a.ts') + sec('src/b.ts');
    expect(paths(build(raw, 'src/a.ts'))).toEqual(['src/b.ts']);
    expect(paths(build(raw, 'src/b.ts'))).toEqual(['src/a.ts']);
  });

  it('u2 orders by tier, shared dirs, then code point; empty stem never tier 1; escapes stems', () => {
    // The finding's section mentions "widget" and "[id]" literally, plus the `index` header line.
    const findingBody = '@@ -1 +1 @@\n-widget\n+[id] foo\n';
    const raw =
      sec('src/app/main.ts', findingBody) +
      sec('zzz/widget.ts') + // tier 1, 0 shared dirs
      sec('src/app/[id].tsx') + // tier 1, 2 shared dirs (stem "[id]" escaped)
      sec('src/other/index.ts') + // tier 1 via the `index` header line, 1 shared dir
      sec('.gitignore') + // empty stem: tier 2
      sec('src/app/zeta.ts') + // tier 2, 2 shared
      sec('src/app/alpha.ts') + // tier 2, 2 shared
      sec('src/app/\u{1F600}.ts') + // astral > BMP U+FF5E
      sec('src/app/～.ts');
    const out = paths(build(raw, 'src/app/main.ts'));
    expect(out).toEqual([
      'src/app/[id].tsx',
      'src/other/index.ts',
      'zzz/widget.ts',
      'src/app/alpha.ts',
      'src/app/zeta.ts',
      'src/app/～.ts',
      'src/app/\u{1F600}.ts',
      '.gitignore',
    ]);
    expect(stemOf('.gitignore')).toBe('');
    expect(stemOf('a/foo.test.ts')).toBe('foo.test');
    expect(stemOf('Makefile')).toBe('Makefile');
    expect(compareCodePoints('\u{1F600}', '～')).toBe(1);
  });

  it('u3 content is the exact raw slice (CRLF -> LF) and never cut', () => {
    const a = sec('a.ts');
    const b = sec('b.ts', '@@ -1 +1 @@\r\n-x\r\n+y\r\n');
    const r = build(a + b, 'a.ts');
    expect(r.inputFiles[0]!.content).toBe(b.replace(/\r\n/g, '\n'));
    const big = sec('c.ts', `@@ -1 +1 @@\n+${'x'.repeat(EVAL_INPUT_LIMITS.fileBytes)}\n`);
    const r2 = build(a + big, 'a.ts');
    expect(r2.inputFiles).toEqual([]);
    expect(r2.context.files_skipped).toEqual([{ path: 'c.ts', reason: 'file_size' }]);
  });

  it('u4 deleted file keeps its old path; same-path sections merge', () => {
    const del = `diff --git a/old.ts b/old.ts\ndeleted file mode 100644\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n`;
    const r = build(sec('a.ts') + del + sec('dup.ts') + sec('dup.ts', '@@ -9 +9 @@\n-p\n+q\n'), 'a.ts');
    expect(paths(r).sort()).toEqual(['dup.ts', 'old.ts']);
    const dup = r.inputFiles.find((f) => f.path === 'dup.ts')!;
    expect(dup.content.match(/^diff --git /gm)).toHaveLength(2);
    expect(r.context.files_unavailable).toBe(0);
  });

  it('u5 one reason each, precedence, and continue after a skip', () => {
    const bin = 'diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n';
    const long = 'd/' + 'p'.repeat(300) + '.ts';
    const r = build(sec('a.ts') + bin + sec(long) + sec('big.ts', `@@ -1 +1 @@\n+${'x'.repeat(70000)}\n`), 'a.ts');
    expect(r.context.files_skipped).toEqual(
      expect.arrayContaining([
        { path: 'img.png', reason: 'no_diff' },
        { path: long, reason: 'path_too_long' },
        { path: 'big.ts', reason: 'file_size' },
      ]),
    );
    // a binary file whose path is also too long: no_diff wins
    const binLong = `diff --git a/${long} b/${long}\nBinary files differ\n`;
    expect(build(sec('a.ts') + binLong, 'a.ts').context.files_skipped[0]!.reason).toBe('no_diff');

    // files_count: 12 small files -> 10 in, 2 skipped
    const many = Array.from({ length: 12 }, (_, i) => sec(`f${String(i).padStart(2, '0')}.ts`)).join('');
    const rc = build(sec('a.ts') + many, 'a.ts');
    expect(rc.inputFiles).toHaveLength(10);
    expect(rc.context.files_skipped.map((s) => s.reason)).toEqual(['files_count', 'files_count']);

    // files_total: 5 x 60KB fit (300KB > 256KB so 5th skipped), then a later small file still included
    const sixty = (n: string) => sec(n, `@@ -1 +1 @@\n+${'x'.repeat(60000)}\n`);
    const rt = build(sec('a.ts') + sixty('b1.ts') + sixty('b2.ts') + sixty('b3.ts') + sixty('b4.ts') + sixty('b5.ts') + sec('c.ts'), 'a.ts');
    expect(rt.context.files_skipped).toEqual([{ path: 'b5.ts', reason: 'files_total' }]);
    expect(paths(rt)).toContain('c.ts');
  });

  it('u6 files_unavailable from files_count vs distinct file sections', () => {
    const raw = sec('a.ts') + sec('b.ts');
    expect(build(raw, 'a.ts', { ...PULL, filesCount: 5 }).context.files_unavailable).toBe(3);
    expect(build(raw, 'a.ts', { ...PULL, filesCount: 1 }).context.files_unavailable).toBe(0);
  });

  it('u7 PR meta truncation and state', () => {
    const raw = sec('a.ts');
    const t = build(raw, 'a.ts', { title: 'x'.repeat(201), body: 'y'.repeat(8001), filesCount: 0 });
    expect(t.inputMeta.title).toBe('x'.repeat(199) + '…');
    expect(t.inputMeta.description).toBe('y'.repeat(7999) + '…');
    expect(t.context.pr_meta).toBe('truncated');
    // surrogate pair straddling the cut
    expect(truncateChars('a'.repeat(198) + '\u{1F600}' + 'zz', 200)).toBe('a'.repeat(198) + '…');
    const n = build(raw, 'a.ts', { title: 'Hi', body: null, filesCount: 0 });
    expect(n.inputMeta).toEqual({ title: 'Hi', description: '' });
    expect(n.context.pr_meta).toBe('attached');
    expect(build(raw, 'a.ts', { title: '', body: null, filesCount: 0 }).context.pr_meta).toBe('empty');
  });

  it('u8 is independent of section order', () => {
    const parts = ['x/a.ts', 'x/b.ts', 'y/c.ts', 'z.ts', 'x/d.ts'].map((p) => sec(p));
    const fwd = build(sec('x/main.ts') + parts.join(''), 'x/main.ts');
    const rev = build([...parts].reverse().join('') + sec('x/main.ts'), 'x/main.ts');
    expect(rev).toEqual(fwd);
  });

  it('u9 headline: imported artifact.ts is first of the Files', () => {
    const run = sec('src/run.ts', "@@ -1 +1 @@\n-x\n+import { a } from './artifact.js';\n");
    const others = Array.from({ length: 12 }, (_, i) => sec(`docs/page${i}.md`)).join('');
    const r = build(run + others + sec('src/artifact.ts', '@@ -0,0 +1 @@\n+new\n'), 'src/run.ts');
    expect(r.inputFiles[0]!.path).toBe('src/artifact.ts');
  });

  it('u10 builds 1000 sections / 5 MB in under 500 ms', () => {
    const body = `@@ -1 +1 @@\n+${'x'.repeat(5000)}\n`;
    const raw = Array.from({ length: 1000 }, (_, i) => sec(`dir${i % 20}/file${i}.ts`, body)).join('');
    expect(raw.length).toBeGreaterThan(5_000_000);
    const t0 = performance.now();
    build(raw, 'dir0/file0.ts');
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('u12 a ~5,000-char non-word stem is never matched: fast, and reported path_too_long', () => {
    const longPath = `d/${'(a+'.repeat(1700)}.ts`;
    const bigBody = `@@ -1 +1 @@\n+${'a'.repeat(200_000)}\n`;
    const raw = sec('src/main.ts', bigBody) + sec(longPath);
    const t0 = performance.now();
    const r = build(raw, 'src/main.ts');
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.context.files_skipped).toEqual([{ path: longPath, reason: 'path_too_long' }]);
  });

  it('u11 log fields carry counts only', () => {
    const r = build(sec('secret/path.ts') + sec('a.ts'), 'a.ts', { title: 'SECRET-TITLE', body: 'SECRET-BODY', filesCount: 0 });
    const out = JSON.stringify(contextLogFields(r.context));
    expect(out).not.toMatch(/SECRET|path\.ts|diff --git/);
    expect(contextLogFields(r.context)).toMatchObject({ files_included: 1, skipped_no_diff: 0, pr_meta: 'attached' });
  });
});
