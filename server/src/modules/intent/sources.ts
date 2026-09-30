import type { RepoRef } from '@devdigest/shared';
import { MAX_INTENT_SOURCE_CHARS, truncateForIntent, type IntentSourceInput } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import { extractReferences, htmlToText, redactUrl } from './helpers.js';

/** A collected source: what the classifier sees (`text`) plus how it went. */
export type CollectedSource = IntentSourceInput;

const decoder = new TextDecoder('utf-8', { fatal: false });

function decodeText(bytes: Uint8Array, filename: string): { text: string } | { binary: true } {
  if (bytes.includes(0)) return { binary: true };
  const raw = decoder.decode(bytes);
  const looksHtml = /\.html?$/i.test(filename) || /^\s*<(?:!doctype html|html)/i.test(raw);
  return { text: looksHtml ? htmlToText(raw) : raw };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * Collect the PR's stated sources through container ports only (GitHub,
 * SafeUrlFetcher). Never throws: a failed fetch becomes an `unresolved` source.
 * `ref` is safe to store/log (URLs are redacted).
 */
export async function collectIntentSources(
  container: Container,
  repo: RepoRef,
  pull: Pick<PullRow, 'body' | 'headSha'>,
): Promise<CollectedSource[]> {
  const refs = extractReferences(pull.body ?? '', repo);

  let github: Awaited<ReturnType<Container['github']>> | null = null;
  let githubErr = 'GitHub not configured';
  if (refs.issues.length > 0 || refs.docs.length > 0) {
    try {
      github = await container.github();
    } catch (e) {
      githubErr = errMsg(e) || githubErr;
    }
  }

  const tasks: Promise<CollectedSource>[] = [];

  for (const i of refs.issues) {
    const ref = `${i.owner}/${i.name}#${i.number}`;
    tasks.push(
      (async (): Promise<CollectedSource> => {
        // Confused-deputy guard: the workspace token must not read another
        // repo's (possibly private) issue just because the PR author named it.
        const sameRepo =
          i.owner.toLowerCase() === repo.owner.toLowerCase() &&
          i.name.toLowerCase() === repo.name.toLowerCase();
        if (!sameRepo) {
          return { kind: 'issue', ref, status: 'unresolved', reason: 'issue in another repository — not fetched', text: '' };
        }
        if (!github) return { kind: 'issue', ref, status: 'unresolved', reason: githubErr, text: '' };
        const issue = await github.getIssue({ owner: i.owner, name: i.name }, i.number);
        return {
          kind: 'issue',
          ref,
          status: 'used',
          reason: null,
          text: truncateForIntent(`${issue.title}\n\n${issue.body ?? ''}`, MAX_INTENT_SOURCE_CHARS),
        };
      })().catch(
        (e): CollectedSource => ({ kind: 'issue', ref, status: 'unresolved', reason: errMsg(e), text: '' }),
      ),
    );
  }

  for (const path of refs.docs) {
    tasks.push(
      (async (): Promise<CollectedSource> => {
        if (!github) return { kind: 'repo_doc', ref: path, status: 'unresolved', reason: githubErr, text: '' };
        const content = await github.getFileContent(repo, path, pull.headSha);
        if (content.includes('\u0000')) {
          return { kind: 'repo_doc', ref: path, status: 'skipped', reason: 'binary', text: '' };
        }
        return {
          kind: 'repo_doc',
          ref: path,
          status: 'used',
          reason: null,
          text: truncateForIntent(content, MAX_INTENT_SOURCE_CHARS),
        };
      })().catch(
        (e): CollectedSource => ({ kind: 'repo_doc', ref: path, status: 'unresolved', reason: errMsg(e), text: '' }),
      ),
    );
  }

  for (const url of refs.urls) {
    const ref = redactUrl(url);
    tasks.push(
      (async (): Promise<CollectedSource> => {
        const doc = await container.urlFetcher.fetch(url);
        const decoded = decodeText(doc.bytes, doc.filename);
        if ('binary' in decoded) return { kind: 'url', ref, status: 'skipped', reason: 'binary', text: '' };
        return {
          kind: 'url',
          ref,
          status: 'used',
          reason: null,
          text: truncateForIntent(decoded.text, MAX_INTENT_SOURCE_CHARS),
        };
      })().catch((e): CollectedSource => ({
        kind: 'url',
        ref,
        // Fetcher errors may echo the URL; the redacted ref is what we keep.
        status: 'unresolved',
        reason: errMsg(e).split(url).join(ref),
        text: '',
      })),
    );
  }

  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
