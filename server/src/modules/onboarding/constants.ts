import type { OnboardingSectionKind } from '@devdigest/shared';

/** Section order is fixed by the contract; titles are the English defaults stored in the tour. */
export const SECTION_TITLES: Record<OnboardingSectionKind, string> = {
  architecture_overview: 'Architecture overview',
  critical_paths: 'Critical paths',
  run_locally: 'How to run locally',
  reading_path: 'Guided reading path',
  first_tasks: 'First tasks',
};

// ---- caps (AC-38..AC-52) ----
export const CRITICAL_PATHS_MAX = 8;
export const READING_PATH_MAX = 10;
export const FIRST_TASKS_MIN = 3;
export const FIRST_TASKS_MAX = 5;
export const FIRST_TASK_PATHS_MAX = 3;
export const RUN_COMMANDS_MAX = 8;
export const STRUCTURE_FOLDERS_MAX = 15;
export const ROUTES_MAX = 40;
export const SCRIPTS_MAX = 30;
export const MANIFESTS_MAX = 10;
export const CHILD_INSTALLS_MAX = 3;
export const SCRIPT_COMMAND_MAX_CHARS = 200;

// ---- budgets ----
export const FACTS_TOKEN_BUDGET = 8000;
export const README_TOKEN_CAP = 1500;
export const MANIFEST_MAX_BYTES = 512 * 1024;
export const NARRATIVE_MAX_TOKENS = 3000;
export const NARRATIVE_TEMPERATURE = 0.2;

// ---- time ----
export const LLM_TIMEOUT_MS = 120_000;
/** > the 120 s LLM deadline + facts gathering + margin (D3). */
export const LOCK_TTL_MS = 180_000;

// ---- text clamps applied after the (lenient) LLM schema parses (D11) ----
export const PROSE_MAX_CHARS = 1200;
export const DIAGRAM_MAX_CHARS = 4000;
export const DESCRIPTION_MAX_CHARS = 120;
export const ANNOTATION_MAX_CHARS = 80;
export const TASK_TITLE_MAX_CHARS = 80;
export const TASK_RATIONALE_MAX_CHARS = 240;

// ---- fixed user-facing sentences (the client renders its own copy from i18n, D19) ----
export const FIRST_TASKS_SKELETON_REASON =
  'First tasks are written by the AI narrative — unavailable in the skeleton.';
/** AC-77: byte-identical to client/messages/en/onboarding.json. */
export const FIRST_TASKS_TOO_FEW_REASON =
  'Fewer than 3 AI-written first tasks cited files in the index — unavailable for this tour.';
export const INDEX_UNAVAILABLE_SECTION_REASON =
  'The code index is not available — no ranked files.';
export const NO_CLONE_RUN_REASON =
  'Clone not available — run commands unavailable.';

// ---- clone facts ----
/** Lockfile → package manager, checked in this order at the repo root. */
export const LOCKFILES: ReadonlyArray<readonly [file: string, pm: 'pnpm' | 'yarn' | 'npm']> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];
export const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
export const README_CANDIDATES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README'] as const;
export const ENV_EXAMPLE = '.env.example';

/** Dependency names recognised as frameworks (AC-38); reported alphabetically. */
export const KNOWN_FRAMEWORKS: readonly string[] = [
  '@angular/core',
  '@nestjs/core',
  '@remix-run/react',
  'astro',
  'electron',
  'express',
  'fastify',
  'hono',
  'koa',
  'next',
  'nuxt',
  'prisma',
  'react',
  'react-native',
  'svelte',
  'vue',
];

/**
 * Files the tour never lists (Rec 4, D12). The first block duplicates the
 * substrings of `JUNK_PATH_PATTERNS` in repo-intel/service.ts ON PURPOSE —
 * conventions sampling keeps its own list; keep both in step by hand.
 */
export const ONBOARDING_EXCLUDED_SUBSTRINGS: readonly string[] = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
  // onboarding additions
  '/fixtures/',
  'generated/',
  '/__generated__/',
  '.generated.',
  '.gen.',
  '.d.mts',
  '.d.cts',
];
/** Root-anchored directories (no leading slash in the path). */
export const ONBOARDING_EXCLUDED_ROOT_PREFIXES: readonly string[] = [
  'test/',
  'tests/',
  '__tests__/',
  'fixtures/',
  'migrations/',
];

export const NARRATIVE_SCHEMA_NAME = 'OnboardingNarrative';
