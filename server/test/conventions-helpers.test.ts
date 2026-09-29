import { describe, it, expect } from 'vitest';
import {
  bucketOf,
  buildSkillBody,
  dedent,
  dedupeCandidates,
  escapeRegex,
  evidenceFilesOf,
  isUsableProbe,
  pickLayered,
  renderSample,
  renderSampleFile,
  resolveSampledPath,
  ruleKey,
  verifyCandidate,
  type SampledFile,
} from '../src/modules/conventions/helpers.js';
import { MAX_FILE_LINES, MAX_SAMPLE_CHARS } from '../src/modules/conventions/constants.js';
import type { ConventionCandidate } from '@devdigest/shared';

/**
 * Hermetic unit tests for the conventions extractor's pure core — no DB, no
 * clone, no model. The evidence gate is the security-critical part: it is the
 * only thing standing between a model's confident paraphrase and a rule the UI
 * presents as fact, so every one of its outcomes is covered.
 */

const FILE_A = `import { z } from 'zod';

export const s = {
  card: { display: 'flex' },
} as const;

export function helper() {
  return 1;
}
`;

const files: SampledFile[] = [
  { path: 'src/app/widget/styles.ts', content: FILE_A },
  { path: 'src/lib/other.ts', content: 'const x = 1;\nconst y = 2;\n' },
];

describe('renderSampleFile', () => {
  it('renders a 1-based line gutter — the thing that makes a citation checkable', () => {
    const out = renderSampleFile('a.ts', 'first\nsecond');
    expect(out).toContain('--- FILE: a.ts ---');
    expect(out).toContain('1 | first');
    expect(out).toContain('2 | second');
  });

  it('truncates a long file and says so', () => {
    const long = Array.from({ length: MAX_FILE_LINES + 50 }, (_, i) => `line ${i}`).join('\n');
    const out = renderSampleFile('big.ts', long);
    expect(out).toContain('… (truncated)');
    expect(out).not.toContain(`line ${MAX_FILE_LINES + 10}`);
  });
});

describe('renderSample', () => {
  it('keeps files within the whole-sample budget and reports which were used', () => {
    const { text, used } = renderSample(files);
    expect(used).toHaveLength(2);
    expect(text).toContain('src/app/widget/styles.ts');
    expect(text.length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS);
  });

  it('drops an overflowing file WHOLE rather than half-rendering it', () => {
    // Per-file truncation runs first, so overflowing the sample budget takes
    // many files, not one huge one. Whatever does not fit must be absent
    // entirely — a half-rendered file would yield citations we cannot verify.
    const fat = Array.from({ length: 30 }, (_, i) => ({
      path: `fat${i}.ts`,
      content: Array.from({ length: MAX_FILE_LINES }, () => 'const padding = "xxxxxxxxxxxxxxxxxxxx";').join('\n'),
    }));
    const { text, used } = renderSample(fat);
    expect(used.length).toBeLessThan(fat.length);
    expect(text.length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS);
    // Every file that survived is present in full, with its header.
    for (const f of used) expect(text).toContain(`--- FILE: ${f.path} ---`);
    // And every file that did not survive is absent entirely.
    const dropped = fat.filter((f) => !used.some((u) => u.path === f.path));
    for (const f of dropped) expect(text).not.toContain(`--- FILE: ${f.path} ---`);
  });
});

describe('layered sampling', () => {
  it('buckets paths by rough architectural kind', () => {
    expect(bucketOf('src/modules/x/routes.ts')).toBe('route');
    expect(bucketOf('src/modules/x/service.ts')).toBe('service');
    expect(bucketOf('src/modules/x/repository.ts')).toBe('data');
    expect(bucketOf('src/app/Card.tsx')).toBe('ui');
    expect(bucketOf('src/x/thing.test.ts')).toBe('test');
  });

  it('caps each bucket so one layer cannot monopolise the sample', () => {
    const picked = pickLayered(
      ['a/routes.ts', 'b/routes.ts', 'c/routes.ts', 'd/routes.ts', 'e/service.ts'],
      2,
    );
    expect(picked.filter((p) => p.includes('routes'))).toHaveLength(2);
    expect(picked).toContain('e/service.ts');
  });
});

describe('resolveSampledPath', () => {
  it('accepts an exact path', () => {
    expect(resolveSampledPath('src/lib/other.ts', files)).toEqual({ path: 'src/lib/other.ts' });
  });

  it('accepts a unique suffix — models often write ./x or a bare basename', () => {
    expect(resolveSampledPath('./styles.ts', files)).toEqual({ path: 'src/app/widget/styles.ts' });
  });

  it('refuses to guess when a suffix is ambiguous', () => {
    const two: SampledFile[] = [
      { path: 'a/styles.ts', content: 'x' },
      { path: 'b/styles.ts', content: 'x' },
    ];
    expect(resolveSampledPath('styles.ts', two)).toEqual({ error: 'path_ambiguous' });
  });

  it('rejects a path that was never sampled', () => {
    expect(resolveSampledPath('nope.ts', files)).toEqual({ error: 'path_not_sampled' });
  });
});

describe('verifyCandidate — the evidence gate', () => {
  it('passes a snippet that really occurs in the cited file', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 3, evidence_snippet: "export const s = {" },
      files,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.line).toBe(3);
      expect(r.snippet).toContain('export const s');
    }
  });

  it('CORRECTS a wrong line number — miscounting is a formatting slip', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 99, evidence_snippet: 'export const s = {' },
      files,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(3);
  });

  it('DROPS an invented snippet — that is a fabrication, not a slip', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 3, evidence_snippet: 'export const totallyMadeUp = 42;' },
      files,
    );
    expect(r).toEqual({ ok: false, reason: 'snippet_not_found' });
  });

  it('drops a snippet too short to identify anything', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 5, evidence_snippet: '}' },
      files,
    );
    expect(r).toEqual({ ok: false, reason: 'snippet_too_short' });
  });

  it('drops a candidate citing a file that was never sampled', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/nope.ts', evidence_line: 1, evidence_snippet: 'export const s = {' },
      files,
    );
    expect(r).toEqual({ ok: false, reason: 'path_not_sampled' });
  });

  it('matches case- and whitespace-insensitively', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 3, evidence_snippet: '  EXPORT   CONST   s = {  ' },
      files,
    );
    expect(r.ok).toBe(true);
  });

  it('returns the snippet sliced from the FILE, not the model text', () => {
    const r = verifyCandidate(
      { evidence_path: 'src/app/widget/styles.ts', evidence_line: 3, evidence_snippet: 'export const S = {' },
      files,
    );
    expect(r.ok).toBe(true);
    // The file spells it lowercase; the model's capitalisation must not survive.
    if (r.ok) expect(r.snippet).toContain('export const s = {');
  });

  it('picks the hit nearest the claimed line when a line repeats', () => {
    const repeated: SampledFile[] = [
      { path: 'r.ts', content: 'const a = 1;\nfiller();\nfiller();\nconst a = 1;\n' },
    ];
    const r = verifyCandidate(
      { evidence_path: 'r.ts', evidence_line: 4, evidence_snippet: 'const a = 1;' },
      repeated,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(4);
  });
});

describe('dedupe', () => {
  it('normalises punctuation and case when comparing rules', () => {
    expect(ruleKey('Use async/await!')).toBe(ruleKey('use async await'));
  });

  it('drops repeats within one scan', () => {
    const { kept, dropped } = dedupeCandidates([{ rule: 'Use X' }, { rule: 'use x.' }]);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('never re-proposes a rule the user already decided on', () => {
    const { kept, dropped } = dedupeCandidates([{ rule: 'Use X' }], ['use x']);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

describe('probe', () => {
  it('escapes regex metacharacters so a literal probe is safe for ripgrep', () => {
    expect(escapeRegex('AsyncState<T>(a.b)')).toBe('AsyncState<T>\\(a\\.b\\)');
  });

  it('rejects a probe too short to be worth counting', () => {
    expect(isUsableProbe('ab')).toBe(false);
    expect(isUsableProbe('export const s = {')).toBe(true);
    expect(isUsableProbe(null)).toBe(false);
  });

  it('rejects the category name — models reliably send it instead of code', () => {
    // Observed live: the model filled probe_literal with "structure", which
    // grepped as an English word and reported 31 files as if it were measured.
    for (const bad of ['structure', 'testing', 'error-handling', 'Typing']) {
      expect(isUsableProbe(bad)).toBe(false);
    }
  });

  it('rejects a probe that could be read as a command-line option', () => {
    // The probe is model-written and becomes an argv element of the grep
    // process. `rg --pre=CMD` runs CMD on every searched file, so a leading
    // dash is refused outright; a legitimate CSS custom property like
    // `--radius-md:` is refused for the same reason (it also made rg exit 2,
    // which silently recorded "0 occurrences" for a real convention).
    for (const bad of ['--pre=/bin/sh', '--radius-md:', '-n', '--files']) {
      expect(isUsableProbe(bad)).toBe(false);
    }
  });

  it('rejects prose and accepts code', () => {
    expect(isUsableProbe('uses async await everywhere')).toBe(false);
    expect(isUsableProbe('naming convention')).toBe(false);
    expect(isUsableProbe('getContext(app.container')).toBe(true);
    expect(isUsableProbe('private db: Db')).toBe(true);
    expect(isUsableProbe('throw new NotFoundError')).toBe(true);
  });
});

describe('dedent', () => {
  it('strips the common leading indentation', () => {
    expect(dedent('    a\n      b')).toBe('a\n  b');
  });
});

describe('buildSkillBody', () => {
  const candidate = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
    id: 'c1',
    repo_id: 'r1',
    category: 'structure',
    rule: 'Co-located styles live in styles.ts',
    rationale: 'Flag inline style objects in the component file.',
    evidence_path: 'src/app/widget/styles.ts',
    evidence_line: 3,
    evidence_snippet: 'export const s = {',
    occurrences: 42,
    confidence: 0.9,
    status: 'accepted',
    created_at: new Date().toISOString(),
    ...over,
  });

  it('groups rules by category and carries each one its own evidence', () => {
    const body = buildSkillBody([candidate(), candidate({ id: 'c2', category: 'naming', rule: 'Name it s' })], 'acme/app');
    expect(body).toContain('# Conventions — acme/app');
    expect(body).toContain('## structure');
    expect(body).toContain('## naming');
    expect(body).toContain('src/app/widget/styles.ts:3');
    expect(body).toContain('42 occurrences');
    expect(body).toContain('export const s = {');
  });

  it('collects the distinct evidence files', () => {
    expect(evidenceFilesOf([candidate(), candidate({ id: 'c2' })])).toEqual(['src/app/widget/styles.ts']);
  });
});
