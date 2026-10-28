import { BRIEF_INPUT_BUDGET } from '@devdigest/reviewer-core';

export const BRIEF_TIMEOUT_MS = 120_000;
export const BRIEF_INPUT_BUDGET_TOKENS = BRIEF_INPUT_BUDGET;
export const GENERATE_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;

export const SMART_DIFF_UNAVAILABLE = 'Smart Diff roles are not available';

export const MISSING = {
  intent: 'not derived yet',
  prBody: 'empty description',
  specs: 'no documents attached to any agent or skill',
  files: 'no changed files available (open the PR once to load its files)',
  linkedIssueNone: 'no linked issue in the PR description',
  linkedIssueOtherRepo: 'issue in another repository — not fetched',
  blastPrefix: 'blast radius unavailable',
} as const;
