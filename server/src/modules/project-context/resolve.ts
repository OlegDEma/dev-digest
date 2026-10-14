import type { CloneDocs, ProjectContextDoc } from '@devdigest/shared';
import { renderProjectContextDoc, type ProjectContextDocInput } from '@devdigest/reviewer-core';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { isLexicallyValidDocPath, MAX_DOC_BYTES } from '../_shared/doc-path.js';
import { formatContextLogLines, orderContextPaths } from './helpers.js';

export interface ResolveInput {
  cloneRoot: string | null;
  repoFullName: string;
  agentDocs: readonly string[];
  skillDocs: ReadonlyArray<readonly string[]>;
  cloneDocs: CloneDocs;
  tokenizer: Tokenizer;
}

export interface ResolvedProjectContext {
  /** Injected documents, in injection order (engine input). */
  docs: ProjectContextDocInput[];
  specsDocs: ProjectContextDoc[];
  specsRead: string[];
  specsMissing: string[];
  lines: string[];
}

/**
 * Run-time resolution: agent docs first, then enabled-skill docs, deduped, each
 * read FRESH from the PR repo's clone (never the estimate cache, AC-26). Never
 * throws: a bad path is a skipped entry, not a failed run (NFR-5). Logs carry
 * paths and counts only, never document text (NFR-8).
 */
export async function resolveProjectContext(input: ResolveInput): Promise<ResolvedProjectContext> {
  const paths = orderContextPaths(input.agentDocs, input.skillDocs);
  const specsDocs: ProjectContextDoc[] = [];
  const docs: ProjectContextDocInput[] = [];

  const skipped = (path: string, reason: NonNullable<ProjectContextDoc['reason']>): ProjectContextDoc => ({
    path,
    repo: input.repoFullName,
    status: 'skipped',
    reason,
    estimated_tokens: null,
    wrapped_text: null,
  });

  for (const path of paths) {
    if (!input.cloneRoot) {
      specsDocs.push(skipped(path, 'no_clone'));
      continue;
    }
    if (!isLexicallyValidDocPath(path)) {
      specsDocs.push(skipped(path, 'outside_repo'));
      continue;
    }
    try {
      const r = await input.cloneDocs.read(input.cloneRoot, path, MAX_DOC_BYTES);
      if (r.kind !== 'ok') {
        specsDocs.push(skipped(path, r.kind));
        continue;
      }
      const wrapped = renderProjectContextDoc({ path, text: r.text });
      docs.push({ path, text: r.text });
      specsDocs.push({
        path,
        repo: input.repoFullName,
        status: 'injected',
        reason: null,
        estimated_tokens: input.tokenizer.count(wrapped),
        wrapped_text: wrapped,
      });
    } catch {
      specsDocs.push(skipped(path, 'unreadable'));
    }
  }

  return {
    docs,
    specsDocs,
    specsRead: specsDocs.filter((d) => d.status === 'injected').map((d) => d.path),
    specsMissing: specsDocs.filter((d) => d.status === 'skipped').map((d) => d.path),
    lines: formatContextLogLines(
      specsDocs.map((d) => ({ path: d.path, status: d.status, reason: d.reason, tokens: d.estimated_tokens })),
    ),
  };
}
