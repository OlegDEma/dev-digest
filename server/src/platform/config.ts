import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Comma list of folder names that make a markdown file project-context
  // eligible (default specs,docs,insights).
  PROJECT_CONTEXT_BUCKETS: z.string().optional(),
  // The action reference the generated CI workflow `uses:` (not a secret). The
  // tag must exist, with the built runner committed, in the target's reach.
  DEVDIGEST_RUNNER_REF: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('OlegDEma/dev-digest/agent-runner@<tag>'),
  ),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
  // off | summary | verbose. Empty/unset = summary. `verbose` only takes effect
  // with NODE_ENV=development and CI unset (see resolvePromptLog).
  PROMPT_LOG: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['off', 'summary', 'verbose']).optional(),
  ),
});

export const DEFAULT_PROJECT_CONTEXT_BUCKETS: readonly string[] = ['specs', 'docs', 'insights'];

export type PromptLogMode = 'off' | 'summary' | 'verbose';

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** `uses:` reference of the agent-runner action written into generated CI workflows. */
  runnerRef: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Folder names whose markdown files are discoverable as project context. */
  projectContextBuckets: string[];
  /** Structured `prompt.assembled` logging: what was asked for vs what is in force. */
  promptLog: {
    requested: PromptLogMode;
    effective: PromptLogMode;
    downgradeReason: string | null;
  };
};

/**
 * `verbose` is a guard against accidental enablement (CI, production), not a
 * security boundary: verbose output is content-free by construction.
 */
export function resolvePromptLog(
  requested: PromptLogMode | undefined,
  nodeEnv: AppConfig['nodeEnv'],
  ci: string | undefined,
): AppConfig['promptLog'] {
  const req = requested ?? 'summary';
  if (req === 'verbose' && (nodeEnv !== 'development' || (ci ?? '') !== '')) {
    return {
      requested: req,
      effective: 'summary',
      downgradeReason: 'PROMPT_LOG=verbose ignored: requires NODE_ENV=development and CI unset',
    };
  }
  return { requested: req, effective: req, downgradeReason: null };
}

function parseBuckets(raw: string | undefined): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return list.length > 0 ? [...new Set(list)] : [...DEFAULT_PROJECT_CONTEXT_BUCKETS];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    runnerRef: parsed.DEVDIGEST_RUNNER_REF,
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    projectContextBuckets: parseBuckets(parsed.PROJECT_CONTEXT_BUCKETS),
    promptLog: resolvePromptLog(parsed.PROMPT_LOG, parsed.NODE_ENV, env.CI),
  };
}
