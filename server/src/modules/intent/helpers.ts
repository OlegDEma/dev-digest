import { posix } from 'node:path';
import type { RepoRef } from '@devdigest/shared';

/** Max references of each kind fed to the classifier. */
export const MAX_ISSUES = 3;
export const MAX_DOCS = 3;
export const MAX_URLS = 3;

export interface IssueRef {
  owner: string;
  name: string;
  number: number;
}

export interface ExtractedReferences {
  issues: IssueRef[];
  /** Repo-relative POSIX paths (normalised, never absolute or `..`-escaping). */
  docs: string[];
  /** Full http(s) URLs (kept intact for fetching; use `redactUrl` before storing/logging). */
  urls: string[];
}

const DOC_EXT = /\.(?:md|mdx|txt)$/i;
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;
const KEYWORD_ISSUE_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)/gi;
/** Tool-attribution footers ("Generated with Claude Code") — never a statement of intent. */
const ATTRIBUTION_URL_RE = /^https?:\/\/(?:www\.)?(?:claude\.com\/claude-code|claude\.ai\/code)\/?$/i;
const ISSUE_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/i;
const BLOB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/(.+)$/i;
const REL_PATH_RE = /(?<![\w./@:-])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|txt))(?![\w/-])/gi;

/** Normalise a repo-relative doc path; null when absolute, empty or escaping the repo. */
export function safeDocPath(raw: string | null): string | null {
  const cleaned = raw?.trim();
  if (!cleaned || cleaned.startsWith('/')) return null;
  const norm = posix.normalize(cleaned);
  if (norm === '.' || norm === '..' || norm.startsWith('../') || norm.startsWith('/')) return null;
  return DOC_EXT.test(norm) ? norm : null;
}

/** `decodeURIComponent` that returns null on a malformed escape (`%ZZ`) instead of throwing. */
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/**
 * Pull the classifier's source references out of a PR body. Issues need a
 * closing keyword (or be an explicit issue URL) — a bare `#N` is NOT a source.
 * Docs are repo-relative `*.md|mdx|txt` paths or same-repo blob URLs; every
 * other http(s) URL is a generic URL. Deduplicated, capped 3/3/3.
 */
export function extractReferences(body: string, repo: RepoRef): ExtractedReferences {
  const issues: IssueRef[] = [];
  const docs: string[] = [];
  const urls: string[] = [];
  const seenIssue = new Set<string>();
  const addIssue = (owner: string, name: string, number: number) => {
    const key = `${owner}/${name}#${number}`.toLowerCase();
    if (seenIssue.has(key)) return;
    seenIssue.add(key);
    issues.push({ owner, name, number });
  };
  const addDoc = (p: string | null) => {
    if (p && !docs.includes(p)) docs.push(p);
  };

  for (const m of body.matchAll(KEYWORD_ISSUE_RE)) {
    addIssue(m[1] ?? repo.owner, m[2] ?? repo.name, Number(m[3]));
  }

  for (const m of body.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING_PUNCT, '');
    if (ATTRIBUTION_URL_RE.test(url)) continue;
    const issue = ISSUE_URL_RE.exec(url);
    if (issue) {
      addIssue(issue[1]!, issue[2]!, Number(issue[3]));
      continue;
    }
    const blob = BLOB_URL_RE.exec(url);
    if (
      blob &&
      blob[1]!.toLowerCase() === repo.owner.toLowerCase() &&
      blob[2]!.toLowerCase() === repo.name.toLowerCase()
    ) {
      const path = safeDocPath(safeDecode(blob[3]!.split(/[?#]/)[0]!));
      if (path) {
        addDoc(path);
        continue;
      }
    }
    if (!urls.includes(url)) urls.push(url);
  }

  const withoutUrls = body.replace(URL_RE, ' ');
  for (const m of withoutUrls.matchAll(REL_PATH_RE)) addDoc(safeDocPath(m[1]!));

  return {
    issues: issues.slice(0, MAX_ISSUES),
    docs: docs.slice(0, MAX_DOCS),
    urls: urls.slice(0, MAX_URLS),
  };
}

/** Strip credentials, query string and fragment — signed URLs carry secrets there. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url.split(/[?#]/)[0]!;
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Crude HTML → text for fetched pages (drops script/style, tags, entities). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}
