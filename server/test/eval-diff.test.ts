import { describe, it, expect } from 'vitest';
import {
  EVAL_INPUT_LIMITS,
  firstDiffFile,
  normalizeEvalDiff,
  parseEvalDiff,
  unmatchableItems,
  validateEvalCaseDraft,
  validateEvalDiff,
  type EvalCaseDraftInput,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const GOOD = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' one',
  '+two',
  ' three',
].join('\n');

const TWO_FILES = [
  GOOD,
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -10,3 +10,2 @@',
  ' x',
  '-gone',
  ' y',
].join('\n');

const draft = (patch: Partial<EvalCaseDraftInput> = {}): EvalCaseDraftInput => ({
  name: 'my-case',
  input_diff: GOOD,
  input_files: [],
  pr_meta: { title: '', description: '' },
  expected: [],
  ...patch,
});

describe('validateEvalDiff (AC-D8a-d)', () => {
  it('accepts a normal diff', () => {
    expect(validateEvalDiff(GOOD)).toBeNull();
    expect(validateEvalDiff(TWO_FILES)).toBeNull();
  });

  it.each(['', 'just some text\nno headers', '   \n'])('no_files for %j', (raw) => {
    expect(validateEvalDiff(raw)).toEqual({ reason: 'no_files' });
  });

  it('no_hunks names the file', () => {
    const raw = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts'].join('\n');
    expect(validateEvalDiff(raw)).toEqual({ reason: 'no_hunks', file: 'src/a.ts' });
    const second = `${GOOD}\ndiff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts`;
    expect(validateEvalDiff(second)).toEqual({ reason: 'no_hunks', file: 'src/b.ts' });
  });

  it('missing_file_header: a hunk before any +++ line', () => {
    expect(validateEvalDiff('@@ -1,1 +1,2 @@\n x\n+y')).toEqual({ reason: 'missing_file_header' });
    expect(validateEvalDiff('diff --git a/a b/a\n@@ -1 +1 @@\n+y')).toEqual({ reason: 'missing_file_header' });
  });

  it('ambiguous_multi_file: several +++ headers without diff --git sections', () => {
    const raw = ['--- a/a.ts', '+++ b/a.ts', '@@ -1 +1 @@', '+x', '--- a/b.ts', '+++ b/b.ts', '@@ -1 +1 @@', '+y'].join('\n');
    expect(validateEvalDiff(raw)).toEqual({ reason: 'ambiguous_multi_file' });
  });

  it('a single +++ header without diff --git is fine', () => {
    expect(validateEvalDiff('--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n+x')).toBeNull();
  });

  it('reports missing_file_header before ambiguous_multi_file before no_files', () => {
    const raw = ['@@ -1 +1 @@', '+x', '+++ b/a.ts', '+++ b/b.ts'].join('\n');
    expect(validateEvalDiff(raw)).toEqual({ reason: 'missing_file_header' });
  });
});

describe('CRLF handling (AC-D8e)', () => {
  it('normalizeEvalDiff turns CRLF into LF', () => {
    expect(normalizeEvalDiff('a\r\nb\r\n')).toBe('a\nb\n');
  });
  it('a CRLF diff validates and parses exactly like the LF one', () => {
    const crlf = TWO_FILES.replace(/\n/g, '\r\n');
    expect(validateEvalDiff(crlf)).toBeNull();
    expect(parseEvalDiff(crlf)).toEqual(parseEvalDiff(TWO_FILES));
    expect(validateEvalCaseDraft(draft({ input_diff: crlf }))).toBeNull();
  });
});

describe('unmatchableItems (AC-D11)', () => {
  const parsed = parseEvalDiff(TWO_FILES);
  it('flags a file outside the diff and lines off the new side', () => {
    const items = [
      { file: 'src/a.ts', start_line: 2 }, // added line
      { file: 'src/a.ts', start_line: 1, end_line: 1 }, // context
      { file: 'src/a.ts', start_line: 40 }, // outside hunk
      { file: 'nope.ts', start_line: 1 }, // not in diff
      { file: 'src/b.ts', start_line: 11 }, // deleted line has no new line; 11 is context 'y'
      { file: 'src/b.ts', start_line: 12, end_line: 99 }, // beyond hunk
    ];
    expect(unmatchableItems(items, parsed)).toEqual([2, 3, 5]);
  });
  it('a range that touches any hunk line can match', () => {
    expect(unmatchableItems([{ file: 'src/a.ts', start_line: 3, end_line: 50 }], parsed)).toEqual([]);
  });
});

describe('unmatchableItems with a huge end_line (W2)', () => {
  it('returns quickly and correctly', () => {
    const parsed = parseEvalDiff(TWO_FILES);
    const t0 = Date.now();
    const out = unmatchableItems(
      [
        { file: 'src/a.ts', start_line: 1, end_line: 2_000_000_000 },
        { file: 'src/a.ts', start_line: 1000, end_line: 2_000_000_000 },
      ],
      parsed,
    );
    expect(out).toEqual([1]);
    expect(Date.now() - t0).toBeLessThan(200);
  });
});

describe('firstDiffFile (AC-D6)', () => {
  it('returns the first path, or "" without files', () => {
    expect(firstDiffFile(TWO_FILES)).toBe('src/a.ts');
    expect(firstDiffFile('')).toBe('');
  });
});

describe('validateEvalCaseDraft', () => {
  it('accepts a valid draft with a valid expected list', () => {
    const expected = [{ kind: 'must_find', file: 'src/a.ts', start_line: 2, severity: 'WARNING', category: 'bug' }];
    expect(validateEvalCaseDraft(draft({ expected }))).toBeNull();
  });

  it.each(['', 'Has-Upper', 'has space', 'a'.repeat(61), 'under_score'])('invalid_name for %j (AC-D12a)', (name) => {
    expect(validateEvalCaseDraft(draft({ name }))).toEqual({ code: 'invalid_name' });
  });

  it('accepts a 60-character name', () => {
    expect(validateEvalCaseDraft(draft({ name: 'a'.repeat(60) }))).toBeNull();
  });

  it('invalid_diff carries the reason and file', () => {
    expect(validateEvalCaseDraft(draft({ input_diff: '' }))).toEqual({ code: 'invalid_diff', reason: 'no_files' });
    expect(
      validateEvalCaseDraft(draft({ input_diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x' })),
    ).toEqual({ code: 'invalid_diff', reason: 'no_hunks', file: 'x' });
  });

  it('invalid_expected_output names the first JSON path (AC-D5)', () => {
    const r = validateEvalCaseDraft(
      draft({ expected: [{ kind: 'must_find', file: 'a.ts', start_line: 1, severity: 'critical', category: 'bug' }] }),
    );
    expect(r).toMatchObject({ code: 'invalid_expected_output', path: '$[0].severity' });
    expect(validateEvalCaseDraft(draft({ expected: { not: 'a list' } }))).toMatchObject({
      code: 'invalid_expected_output',
      path: '$',
    });
  });

  it('an unknown key is named in the path (EC-D33)', () => {
    const r = validateEvalCaseDraft(
      draft({ expected: [{ file: 'a.ts', start_line: 1, severity: 'WARNING', category: 'bug', bogus: 1 }] }),
    );
    expect(r).toMatchObject({ code: 'invalid_expected_output', path: '$[0].bogus' });
  });

  it('duplicate_file_path', () => {
    const files = [
      { path: 'a.ts', content: '1' },
      { path: 'a.ts', content: '2' },
    ];
    expect(validateEvalCaseDraft(draft({ input_files: files }))).toEqual({
      code: 'duplicate_file_path',
      path: 'a.ts',
    });
  });
});

describe('input limits (AC-D10a)', () => {
  const L = EVAL_INPUT_LIMITS;
  const big = (n: number) => 'x'.repeat(n);

  it('diff over 256 KB; exactly 256 KB is allowed', () => {
    const prefix = `${GOOD}\n+`;
    const atLimit = prefix + big(L.diffBytes - prefix.length);
    expect(atLimit.length).toBe(L.diffBytes);
    expect(validateEvalCaseDraft(draft({ input_diff: atLimit }))).toBeNull();
    expect(validateEvalCaseDraft(draft({ input_diff: `${atLimit}x` }))).toEqual({
      code: 'input_too_large',
      limit: 'diff',
    });
  });

  it('measures bytes, not characters', () => {
    const multibyte = `${GOOD}\n+${'é'.repeat(L.diffBytes / 2)}`;
    expect(validateEvalCaseDraft(draft({ input_diff: multibyte }))).toEqual({ code: 'input_too_large', limit: 'diff' });
  });

  it('one file over 64 KB', () => {
    const files = [{ path: 'a.ts', content: big(L.fileBytes + 1) }];
    expect(validateEvalCaseDraft(draft({ input_files: files }))).toEqual({ code: 'input_too_large', limit: 'file' });
    expect(validateEvalCaseDraft(draft({ input_files: [{ path: 'a.ts', content: big(L.fileBytes) }] }))).toBeNull();
  });

  it('all files over 256 KB', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.ts`, content: big(L.fileBytes) }));
    expect(validateEvalCaseDraft(draft({ input_files: files }))).toEqual({
      code: 'input_too_large',
      limit: 'files_total',
    });
  });

  it('more than 10 files', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.ts`, content: 'x' }));
    expect(validateEvalCaseDraft(draft({ input_files: mk(10) }))).toBeNull();
    expect(validateEvalCaseDraft(draft({ input_files: mk(11) }))).toEqual({
      code: 'input_too_large',
      limit: 'files_count',
    });
  });

  it('PR title over 200 and description over 8,000 characters', () => {
    expect(validateEvalCaseDraft(draft({ pr_meta: { title: big(201), description: '' } }))).toEqual({
      code: 'input_too_large',
      limit: 'pr_title',
    });
    expect(validateEvalCaseDraft(draft({ pr_meta: { title: big(200), description: big(8000) } }))).toBeNull();
    expect(validateEvalCaseDraft(draft({ pr_meta: { title: '', description: big(8001) } }))).toEqual({
      code: 'input_too_large',
      limit: 'pr_description',
    });
  });
});

describe('parseEvalDiff agrees with parseUnifiedDiff (guard against parser drift)', () => {
  const fixtures: Record<string, string> = {
    single: GOOD,
    twoFiles: TWO_FILES,
    multiHunk: [
      'diff --git a/src/m.ts b/src/m.ts',
      '--- a/src/m.ts',
      '+++ b/src/m.ts',
      '@@ -1,3 +1,4 @@ fn',
      ' a',
      '-b',
      '+b1',
      '+b2',
      ' c',
      '@@ -20,2 +21,3 @@',
      ' x',
      '+y',
      ' z',
    ].join('\n'),
    newFile: [
      'diff --git a/src/n.ts b/src/n.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/n.ts',
      '@@ -0,0 +1,3 @@',
      '+one',
      '+two',
      '+three',
    ].join('\n'),
    deletedFile: [
      'diff --git a/src/d.ts b/src/d.ts',
      'deleted file mode 100644',
      '--- a/src/d.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-one',
      '-two',
    ].join('\n'),
    plusPlusContent: [
      'diff --git a/src/p.ts b/src/p.ts',
      '--- a/src/p.ts',
      '+++ b/src/p.ts',
      '@@ -1,2 +1,3 @@',
      ' a',
      '+++counter',
      '+b',
      '----',
      ' c',
    ].join('\n'),
    noFinalNewline: `${GOOD}\n\\ No newline at end of file\n`,
  };

  it.each(Object.keys(fixtures))('%s', (name) => {
    const raw = fixtures[name]!;
    const server = parseUnifiedDiff(raw).files.map((f) => ({
      path: f.path,
      lines: [...new Set(f.hunks.flatMap((h) => h.newLineNumbers))].sort((a, b) => a - b),
      hunks: f.hunks.length,
    }));
    const shared = parseEvalDiff(raw).files.map((f) => ({
      path: f.path,
      lines: [...f.newLines].sort((a, b) => a - b),
      hunks: f.hunks,
    }));
    expect(shared).toEqual(server);
  });
});
