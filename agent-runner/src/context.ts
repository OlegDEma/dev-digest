import { readFileSync } from 'node:fs';
import { RunnerError } from './errors.js';

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
}

/** Resolve the PR from the Actions environment (`GITHUB_REPOSITORY` + the event payload). */
export function resolvePrContext(env: NodeJS.ProcessEnv): PrContext {
  const slug = env.GITHUB_REPOSITORY ?? '';
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) throw new RunnerError('GITHUB_REPOSITORY is not set (expected owner/name)');
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new RunnerError('GITHUB_EVENT_PATH is not set — run on a pull_request event');
  let number: unknown;
  try {
    number = (JSON.parse(readFileSync(eventPath, 'utf8')) as { pull_request?: { number?: unknown } })
      .pull_request?.number;
  } catch {
    throw new RunnerError('Cannot read the GitHub event payload');
  }
  if (typeof number !== 'number') throw new RunnerError('The event payload has no pull_request.number');
  return { owner, repo, prNumber: number };
}
