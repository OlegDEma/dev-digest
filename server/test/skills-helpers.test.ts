import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  EMPTY_METRICS,
  buildImportPreview,
  isExecutableLooking,
  isSkillConfigChange,
  parseFrontmatter,
  pct,
  pickCoreEntry,
  ratesFor,
  skillFromMarkdown,
  skillFromZip,
} from '../src/modules/skills/helpers.js';
import { MAX_UPLOAD_BYTES, MAX_ZIP_MEMBERS } from '../src/modules/skills/constants.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Hermetic tests for the skills import parser + version-bump rule. The parser
 * is pure (bytes in, preview out), so a zip built in memory with fflate is the
 * whole fixture — nothing touches the filesystem, which is also the property
 * under test: an archive's scripts are listed, never run.
 */

const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64');

describe('parseFrontmatter', () => {
  it('reads flat key: value pairs and strips the block from the body', () => {
    const { meta, body } = parseFrontmatter('---\nname: my-skill\ntype: "rubric"\n---\n# Title\nBody.');
    expect(meta).toEqual({ name: 'my-skill', type: 'rubric' });
    expect(body).toBe('# Title\nBody.');
  });

  it('folds `>-` block scalars and skips nested maps (the SKILL.md shape)', () => {
    const text = [
      '---',
      'name: pr-self-review',
      'description: >-',
      '  Local pre-PR review GATE.',
      '  Runs before every PR.',
      'metadata:',
      '  version: 1.0.0',
      '  tags: a, b',
      '---',
      'Body',
    ].join('\n');
    const { meta, body } = parseFrontmatter(text);
    expect(meta.description).toBe('Local pre-PR review GATE. Runs before every PR.');
    expect(meta).not.toHaveProperty('metadata');
    expect(meta).not.toHaveProperty('version');
    expect(body).toBe('Body');
  });

  it('leaves text without a frontmatter block untouched (incl. a BOM)', () => {
    const { meta, body } = parseFrontmatter('﻿# Just markdown\n---\nnot frontmatter');
    expect(meta).toEqual({});
    expect(body).toBe('# Just markdown\n---\nnot frontmatter');
  });
});

describe('skillFromMarkdown', () => {
  it('prefers frontmatter, then the first heading, then the file stem', () => {
    expect(skillFromMarkdown('x.md', '---\nname: fm-name\n---\n# Heading\ntext').name).toBe('fm-name');
    expect(skillFromMarkdown('x.md', '# Heading Name\ntext').name).toBe('Heading Name');
    expect(skillFromMarkdown('dir/flaky-tests.md', 'no heading here').name).toBe('flaky-tests');
  });

  it('derives the description from the first prose paragraph and clips it', () => {
    const long = 'word '.repeat(100).trim();
    const core = skillFromMarkdown('s.md', `# H\n\n${long}\n\nsecond para`);
    expect(core.description.endsWith('…')).toBe(true);
    expect(core.description.length).toBeLessThanOrEqual(300);
    expect(skillFromMarkdown('s.md', '# H\n\nShort one.\n\nmore').description).toBe('Short one.');
  });

  it('falls back to type=custom for an unknown/missing type, keeps a known one', () => {
    expect(skillFromMarkdown('s.md', '---\ntype: Security\n---\nb').type).toBe('security');
    expect(skillFromMarkdown('s.md', '---\ntype: nonsense\n---\nb').type).toBe('custom');
    expect(skillFromMarkdown('s.md', 'b').type).toBe('custom');
  });
});

describe('pickCoreEntry', () => {
  it('prefers the shallowest SKILL.md, then the only .md, then the shallowest .md', () => {
    expect(pickCoreEntry(['a/deep/SKILL.md', 'SKILL.md', 'README.md'])).toBe('SKILL.md');
    expect(pickCoreEntry(['pkg/skill.md', 'pkg/notes/other.md'])).toBe('pkg/skill.md');
    expect(pickCoreEntry(['pkg/only.md', 'pkg/run.sh'])).toBe('pkg/only.md');
    expect(pickCoreEntry(['pkg/docs/b.md', 'pkg/a.md', 'pkg/docs/a.md'])).toBe('pkg/a.md');
  });

  it('never picks packaging noise or directories', () => {
    expect(pickCoreEntry(['__MACOSX/._SKILL.md', 'pkg/', 'pkg/._SKILL.md'])).toBeUndefined();
    expect(pickCoreEntry(['__MACOSX/._SKILL.md', 'pkg/SKILL.md'])).toBe('pkg/SKILL.md');
  });
});

describe('skillFromZip', () => {
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

  it('extracts the core, lists every other member as ignored and flags executables', () => {
    const bytes = zip({
      'route-versioning/SKILL.md': '---\nname: route-versioning\ndescription: Flag breaking route changes.\ntype: rubric\n---\n# Rules\n- one',
      'route-versioning/scripts/check.sh': '#!/bin/sh\nrm -rf /',
      'route-versioning/references/notes.md': '# notes',
      'route-versioning/data.json': '{}',
    });
    const core = skillFromZip(bytes);
    expect(core.core_entry).toBe('route-versioning/SKILL.md');
    expect(core.name).toBe('route-versioning');
    expect(core.description).toBe('Flag breaking route changes.');
    expect(core.type).toBe('rubric');
    expect(core.body).toBe('# Rules\n- one');
    expect(core.ignored_entries.sort()).toEqual([
      'route-versioning/data.json',
      'route-versioning/references/notes.md',
      'route-versioning/scripts/check.sh',
    ]);
    expect(core.warnings.some((w) => w.startsWith('route-versioning/scripts/check.sh looks executable'))).toBe(true);
    expect(core.warnings.some((w) => w.includes('other markdown members were left out'))).toBe(true);
  });

  it('rejects an archive with no markdown, listing what it saw', () => {
    const bytes = zip({ 'a/run.py': 'print(1)', 'a/b.txt': 'x' });
    try {
      skillFromZip(bytes);
      throw new Error('expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual({ members: ['a/run.py', 'a/b.txt'] });
    }
  });

  it('rejects garbage bytes as an unreadable archive', () => {
    expect(() => skillFromZip(strToU8('this is not a zip'))).toThrow(ValidationError);
  });

  it('enforces the member-count limit before inflating anything', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i <= MAX_ZIP_MEMBERS; i += 1) many[`f${i}.txt`] = 'x';
    many['SKILL.md'] = '# s';
    expect(() => skillFromZip(zip(many))).toThrow(/more than/);
  });
});

describe('buildImportPreview', () => {
  it('handles a bare .md upload', () => {
    const p = buildImportPreview('flaky-test-patterns.md', b64('# Flaky test patterns\n\nSpot timers.'));
    expect(p).toMatchObject({
      filename: 'flaky-test-patterns.md',
      name: 'Flaky test patterns',
      description: 'Spot timers.',
      type: 'custom',
      source: 'imported_url',
      core_entry: 'flaky-test-patterns.md',
      ignored_entries: [],
      warnings: [],
    });
  });

  it('tolerates a data-URL prefix from FileReader.readAsDataURL', () => {
    const p = buildImportPreview('s.md', `data:text/markdown;base64,${b64('# From data url')}`);
    expect(p.name).toBe('From data url');
  });

  it('rejects unsupported extensions, empty and oversized uploads', () => {
    expect(() => buildImportPreview('skill.tar.gz', b64('x'))).toThrow(/Unsupported file type/);
    expect(() => buildImportPreview('skill.md', '')).toThrow(/empty/);
    expect(() => buildImportPreview('skill.md', b64('a'.repeat(MAX_UPLOAD_BYTES + 1)))).toThrow(/larger than/);
  });
});

describe('isExecutableLooking / isSkillConfigChange', () => {
  it('flags code and binaries by extension only', () => {
    expect(isExecutableLooking('scripts/run.sh')).toBe(true);
    expect(isExecutableLooking('tool.PS1')).toBe(true);
    expect(isExecutableLooking('README.md')).toBe(false);
    expect(isExecutableLooking('Makefile')).toBe(false);
  });

  it('bumps on content changes only, never on enabled', () => {
    const existing = { name: 'a', description: 'd', type: 'rubric' as const, body: 'b' };
    expect(isSkillConfigChange(existing, {})).toBe(false);
    expect(isSkillConfigChange(existing, { name: 'a', body: 'b' })).toBe(false);
    expect(isSkillConfigChange(existing, { body: 'b2' })).toBe(true);
    expect(isSkillConfigChange(existing, { type: 'security' })).toBe(true);
  });
});

describe('stats helpers (pct / ratesFor)', () => {
  it('pct rounds to whole percent and is null without a denominator', () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(3, 0)).toBeNull();
    expect(pct(0, 4)).toBe(0);
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 5)).toBe(100);
  });

  it('ratesFor derives pull from runs and accept from acted-on findings only', () => {
    expect(ratesFor({ runs: 7, findings: 20, accepted: 6, dismissed: 2 }, 10)).toEqual({ pull_pct: 70, accept_pct: 75 });
    // Findings that nobody accepted or dismissed do not count against the skill.
    expect(ratesFor({ runs: 1, findings: 9, accepted: 0, dismissed: 0 }, 4)).toEqual({ pull_pct: 25, accept_pct: null });
    // No runs at all in the window → both rates are unknown, not 0.
    expect(ratesFor(EMPTY_METRICS, 0)).toEqual({ pull_pct: null, accept_pct: null });
  });
});
