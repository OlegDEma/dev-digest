import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Tokenizer } from '../adapters/tokenizer/index.js';
import type { AppConfig, PromptLogMode } from './config.js';
import type { PinoLike } from './run-logger.js';

export type { PromptLogMode } from './config.js';

/**
 * Structured, content-free `prompt.assembled` record — one per LLM call.
 * Built field by field from measurements: prompt text is measured and dropped.
 */

/** Per-boot key: fingerprints are comparable within one process only. Never exported/logged/persisted. */
const FP_KEY = randomBytes(32);

type Feature = 'review' | 'intent' | 'conventions';
type Origin =
  | 'agent_config' | 'app' | 'skill' | 'memory' | 'spec' | 'pr_title' | 'pr_body' | 'issue'
  | 'repo_doc' | 'url' | 'unresolved_refs' | 'derived' | 'repo_code' | 'diff' | 'file_list'
  | 'other';
interface RegistryEntry {
  role: 'system' | 'user';
  source: 'trusted' | 'untrusted';
  origin: Origin;
}

const sys = (origin: Origin): RegistryEntry => ({ role: 'system', source: 'trusted', origin });
const usr = (origin: Origin, source: 'trusted' | 'untrusted' = 'untrusted'): RegistryEntry => ({
  role: 'user',
  source,
  origin,
});

export const SECTION_REGISTRY: Record<Feature, Record<string, RegistryEntry>> = {
  review: {
    system: sys('agent_config'),
    task: usr('pr_title'),
    pr_description: usr('pr_body'),
    skills: usr('skill', 'trusted'),
    memory: usr('memory', 'trusted'),
    repo_map: usr('repo_code'),
    specs: usr('spec'),
    callers: usr('repo_code'),
    intent: usr('derived'),
    diff: usr('diff'),
  },
  intent: {
    system: sys('app'),
    title: usr('pr_title'),
    body: usr('pr_body'),
    issues: usr('issue'),
    docs: usr('repo_doc'),
    urls: usr('url'),
    unresolved: usr('unresolved_refs'),
    file_list: usr('file_list'),
  },
  conventions: {
    system: sys('app'),
    repo_sample: usr('repo_code'),
  },
};

const OTHER: RegistryEntry & { name: 'other' } = {
  name: 'other',
  role: 'user',
  source: 'untrusted',
  origin: 'other',
};

const MAX_ITEM_NAMES = 50;
const MAX_ITEM_NAME_CHARS = 200;

/** First 8 hex of HMAC-SHA256(key, text). `key` param is for tests only. */
export function fingerprint(text: string, key: Buffer = FP_KEY): string {
  return createHmac('sha256', key).update(text).digest('hex').slice(0, 8);
}

export interface PromptSectionInput {
  name: string;
  text: string;
  items?: number;
  itemNames?: string[];
}

export interface PromptLogCall {
  feature: Feature;
  provider: string;
  model: string;
  sections: PromptSectionInput[];
  runId?: string;
  runIds?: string[];
  prId?: string;
  repoId?: string;
  agent?: string;
  sessionId?: string;
  chunk?: { index: number; count: number; path?: string };
}

export interface PromptSectionRecord {
  name: string;
  role: 'system' | 'user';
  source: 'trusted' | 'untrusted';
  origin: Origin;
  chars: number;
  tokens: number;
  items: number;
  fingerprint?: string;
  item_names?: string[];
}

export interface PromptAssembledRecord {
  event: 'prompt.assembled';
  v: 1;
  call_id: string;
  feature: Feature;
  provider: string;
  model: string;
  mode: 'summary' | 'verbose';
  run_id?: string;
  run_ids?: string[];
  pr_id?: string;
  repo_id?: string;
  agent?: string;
  session_id?: string;
  chunk?: { index: number; count: number; path?: string };
  sections: PromptSectionRecord[];
  totals: { chars: number; tokens: number; sections: number };
}

export function buildPromptRecord(
  call: PromptLogCall,
  mode: 'summary' | 'verbose',
  tokenizer: Tokenizer,
  callId: string,
): PromptAssembledRecord {
  const verbose = mode === 'verbose';
  const registry = SECTION_REGISTRY[call.feature];
  let chars = 0;
  let tokens = 0;

  const sections = call.sections.map((s): PromptSectionRecord => {
    const known = Object.prototype.hasOwnProperty.call(registry, s.name) ? registry[s.name] : undefined;
    const meta = known ? { name: s.name, ...known } : OTHER;
    const secChars = s.text.length;
    const secTokens = tokenizer.count(s.text);
    chars += secChars;
    tokens += secTokens;
    const rec: PromptSectionRecord = {
      name: meta.name,
      role: meta.role,
      source: meta.source,
      origin: meta.origin,
      chars: secChars,
      tokens: secTokens,
      items: s.items ?? 1,
    };
    if (verbose) {
      rec.fingerprint = fingerprint(s.text);
      if (s.itemNames) {
        rec.item_names = s.itemNames
          .slice(0, MAX_ITEM_NAMES)
          .map((n) => String(n).slice(0, MAX_ITEM_NAME_CHARS));
      }
    }
    return rec;
  });

  const record: PromptAssembledRecord = {
    event: 'prompt.assembled',
    v: 1,
    call_id: callId,
    feature: call.feature,
    provider: call.provider,
    model: call.model,
    mode,
    sections,
    totals: { chars, tokens, sections: sections.length },
  };
  if (call.runId !== undefined) record.run_id = call.runId;
  if (call.runIds !== undefined) record.run_ids = call.runIds;
  if (call.prId !== undefined) record.pr_id = call.prId;
  if (call.repoId !== undefined) record.repo_id = call.repoId;
  if (call.agent !== undefined) record.agent = call.agent;
  if (call.chunk) {
    record.chunk = { index: call.chunk.index, count: call.chunk.count };
    if (verbose && call.chunk.path !== undefined) record.chunk.path = call.chunk.path;
  }
  if (verbose && call.sessionId !== undefined) record.session_id = call.sessionId;
  return record;
}

/**
 * Emit one `prompt.assembled` line to pino (never via RunLogger — its data also
 * goes to SSE). Never throws. Returns the call_id, or null when nothing was logged.
 */
export function emitPromptAssembled(
  logger: Pick<PinoLike, 'info' | 'warn'> | undefined,
  mode: PromptLogMode,
  tokenizer: Tokenizer,
  call: PromptLogCall,
): string | null {
  if (!logger || mode === 'off') return null;
  try {
    const callId = randomUUID();
    logger.info(buildPromptRecord(call, mode, tokenizer, callId), 'prompt.assembled');
    return callId;
  } catch (e) {
    try {
      logger.warn(
        { event: 'prompt.assembled.failed', err: (e as Error)?.name },
        'prompt.assembled failed',
      );
    } catch {
      /* logging must never fail an LLM call */
    }
    return null;
  }
}

export function promptLogMode(container: { config?: AppConfig }): PromptLogMode {
  return container.config?.promptLog.effective ?? 'off';
}
