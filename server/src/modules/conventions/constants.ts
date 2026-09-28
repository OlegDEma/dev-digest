/**
 * Tunables for the conventions extractor. Every budget here exists so one scan
 * has a bounded, predictable cost: the sample is capped before the model sees
 * it, and the model's answer is capped before the gate runs.
 * See specs/04-conventions.md §5.
 */

/**
 * Config files worth sampling verbatim — they state a repo's rules rather than
 * demonstrating them. Missing entries are skipped silently; a repo is not
 * required to have any of these.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'biome.json',
  '.editorconfig',
  'CONTRIBUTING.md',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
] as const;

/** Top-N code files pulled from repo-intel's rank. The criterion's literal 12. */
export const CODE_SAMPLE_COUNT = 12;

/**
 * Extra files pulled by the LAYERED pass (§5.1): the top-ranked 12 are usually
 * the most central files and therefore often the same layer. Bucketing by kind
 * and taking a few per bucket surfaces layer-specific rules the flat top-N
 * cannot see — including test conventions, which the rank filter drops.
 */
export const LAYERED_SAMPLE_COUNT = 40;
export const PER_BUCKET_COUNT = 3;

/** Per-file truncation, so one huge file cannot eat the whole sample budget. */
export const MAX_FILE_LINES = 220;
export const MAX_FILE_CHARS = 12_000;

/** Whole-sample budget handed to the model. */
export const MAX_SAMPLE_CHARS = 90_000;

/** Ceiling on candidates the model may return in one scan. */
export const MAX_CANDIDATES = 12;

/**
 * Minimum non-whitespace characters for a snippet to count as evidence. `}` or
 * `);` identifies nothing, so a snippet that short cannot ground a rule.
 */
export const MIN_SNIPPET_CHARS = 8;

/** Lines of context sliced from the file around a verified snippet. */
export const SNIPPET_CONTEXT_LINES = 3;

/** Temperature for the single extraction call — near-deterministic. */
export const EXTRACTION_TEMPERATURE = 0.1;

/**
 * Fallback walk (see service.sample): extensions worth reading, directories
 * never worth reading, and the cap on how many files the walk may return.
 */
export const WALK_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;
export const WALK_IGNORE_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'clones',
  'migrations',
  '.turbo',
] as const;
export const WALK_MAX_FILES = 400;

/** A probe shorter than this is too generic to count occurrences with. */
export const MIN_PROBE_CHARS = 4;

/** Default name for the assembled skill (homework criterion 42). */
export const DEFAULT_SKILL_NAME = 'repo-conventions';
