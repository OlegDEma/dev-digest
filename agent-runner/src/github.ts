import type { GitHubReviewPayload } from '@devdigest/shared';
import type { PrContext } from './context.js';
import { RunnerError } from './errors.js';

/**
 * Plain-`fetch` GitHub REST calls (no octokit). `fetchImpl` is injectable so
 * tests never touch the network. The token only ever goes into the
 * Authorization header — it is never logged or put in an error message.
 */
export type FetchLike = typeof fetch;

const API = 'https://api.github.com';

function headers(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'devdigest-agent-runner',
  };
}

async function fail(what: string, res: Response): Promise<never> {
  throw new RunnerError(`GitHub API error ${what}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
}

export async function fetchPrDiff(ctx: PrContext, token: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const res = await fetchImpl(`${API}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}`, {
    headers: headers(token, 'application/vnd.github.diff'),
  });
  if (!res.ok) await fail('fetching the PR diff', res);
  return res.text();
}

/** `post_as: github_review` — body + event + inline comments. */
export async function postGithubReview(
  ctx: PrContext,
  token: string,
  payload: GitHubReviewPayload,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${API}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}/reviews`;
  const post = (body: Record<string, unknown>) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { ...headers(token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  // GITHUB_TOKEN may not APPROVE a PR (422); submit it as a plain COMMENT.
  const base = { body: payload.body, event: payload.event === 'APPROVE' ? 'COMMENT' : payload.event };
  const comments = payload.comments ?? [];
  let res = await post(comments.length ? { ...base, comments } : base);
  // One unresolvable inline anchor rejects the whole review; retry body-only.
  if (res.status === 422 && comments.length) res = await post(base);
  if (!res.ok) await fail('posting the review', res);
}

/** `post_as: pr_comment` — a plain issue comment on the PR. */
export async function postPrComment(
  ctx: PrContext,
  token: string,
  body: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`${API}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`, {
    method: 'POST',
    headers: { ...headers(token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) await fail('posting the PR comment', res);
}
