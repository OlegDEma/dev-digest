import type { Intent } from '@devdigest/shared';

/** Token counter injected by the caller (the engine does no I/O and owns no tokenizer). */
export type CountTokens = (s: string) => number;

export interface BriefRange {
  start: number;
  count: number;
}

/**
 * Everything the model may see. No field can carry a hunk body: files are
 * paths + stats + new-side line ranges only.
 */
export interface BriefFacts {
  title: string;
  body: string | null;
  issue: { ref: string; title: string; body: string } | null;
  intent: Intent | null;
  blast: { summary: string; callers: { name: string; file: string; line: number }[] } | null;
  files: { path: string; additions: number; deletions: number; ranges: BriefRange[] }[];
  specs: { path: string; text: string }[];
}

export interface BriefSection {
  name: 'system' | 'title' | 'body' | 'issue' | 'intent' | 'blast' | 'files' | 'specs';
  text: string;
  tokens: number;
}
