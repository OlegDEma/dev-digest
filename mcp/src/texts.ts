// Every model-visible string lives here, byte-for-byte from spec 11 §7b.
// Change the spec first, then this file; test/verbatim.test.ts guards the drift.

export const INSTRUCTIONS =
  'DevDigest code review via the local API. Address a PR as repo "owner/name" + pr number. Get an agent from list_agents. run_agent_on_pr runs it and waits up to 2 min; if it answers status "running", call get_findings(run_id) later.';

export const DESCRIBE = {
  repo: 'GitHub repo as owner/name',
  pr: 'Pull request number',
  limit: 'Max findings to return',
  agent: 'Agent name or id from list_agents',
  runId: 'run_id returned by run_agent_on_pr',
  detail: 'full adds rationale and suggestion',
} as const;

export const TOOL_TEXTS = {
  list_agents: {
    title: 'List reviewer agents',
    description:
      "List the configured code review agents (e.g. security, bug or style reviewers). Use an agent's name or id as the agent argument of run_agent_on_pr.",
  },
  run_agent_on_pr: {
    title: 'Run a review on a PR',
    description:
      'Run a code review of a GitHub pull request (PR) with one reviewer agent, wait up to 2 min and return the verdict and security/bug findings. If still running, returns run_id for get_findings.',
  },
  get_findings: {
    title: 'Get findings of a run',
    description:
      'Get the verdict and code review findings (severity, file, line) of a PR review run started by run_agent_on_pr. Pages with limit/offset.',
  },
  get_conventions: {
    title: 'Get repo conventions',
    description: 'Get the coding conventions and style rules extracted for a GitHub repo, used by code review (accepted ones by default).',
  },
  get_blast_radius: {
    title: 'PR blast radius',
    description:
      'Map what a pull request (PR) can break: symbols declared in the changed files, their callers (file:line) and the HTTP endpoints and cron jobs behind them. Call before reviewing a PR. Read-only, from the code index.',
  },
} as const;

// ---- shared API errors ----------------------------------------------------

export const unreachable = (apiUrl: string): string =>
  `DevDigest API not reachable at ${apiUrl}. Start it with ./scripts/dev.sh (or set DEVDIGEST_API_URL), then retry.`;

export const RATE_LIMITED =
  'Rate limited by the DevDigest API (review runs: 10 per minute). Wait a minute, then retry.';

export const apiError = (status: number, code: string, message: string): string =>
  `DevDigest API error ${status} ${code}: ${message}`;

export const repoNotFound = (repo: string, known: string[]): string =>
  `Repo '${repo}' not found. Known repos: ${known.slice(0, 10).join(', ')}. Use one of them as repo (owner/name).`;

export const repoNotFoundNoRepos = (repo: string): string =>
  `Repo '${repo}' not found and no repos are connected. Add the repo in the DevDigest studio first.`;

// ---- shared run-outcome errors --------------------------------------------

export const runFailed = (runId: string, error: string | null): string =>
  `Review run ${runId} failed: ${error ?? 'unknown error'}. Fix the cause (e.g. the provider API key in Settings), then call run_agent_on_pr again.`;

export const runCancelled = (runId: string): string =>
  `Review run ${runId} was cancelled. Call run_agent_on_pr to start a new one.`;

// ---- run_agent_on_pr errors -----------------------------------------------

export const prNotFound = (pr: number, repo: string, tool = 'run_agent_on_pr'): string =>
  `PR #${pr} not found in ${repo}. Check the number with gh pr list --repo ${repo}; if it is listed, open the PR in the DevDigest studio to sync it, then call ${tool} again.`;

export const agentNotFound = (agent: string): string =>
  `Agent '${agent}' not found. Call list_agents to get a valid name or id.`;

export const agentDisabled = (name: string): string =>
  `Agent '${name}' is disabled. Enable it in the DevDigest studio, or call list_agents and pick an enabled agent.`;

export const lostContact = (runId: string): string =>
  `Lost contact with the DevDigest API while waiting. The review keeps running; call get_findings with run_id "${runId}" in ~30s.`;

// ---- get_findings errors --------------------------------------------------

export const runNotFound = (runId: string): string =>
  `Run '${runId}' not found. Use a run_id returned by run_agent_on_pr, or call run_agent_on_pr to start a review.`;

// ---- success-answer `next` strings ----------------------------------------

export const BLAST_FLAG_OFF_NEXT =
  'Repo intelligence is off (REPO_INTEL_ENABLED=false), so there is no map. Enable it, restart the DevDigest API, index the repo, then call get_blast_radius again.';

export const blastIndexNext = (reason: string): string =>
  `The code index is incomplete (${reason}); the map may miss callers. Resync the repo in the DevDigest studio, then call get_blast_radius again.`;

export const AGENTS_EMPTY_NEXT =
  'No agents configured. Create one in the DevDigest studio (Agents page).';

export const runningNextFromRun = (waitSec: number, runId: string): string =>
  `Review still running after ${waitSec}s. Call get_findings with run_id "${runId}" in ~30s.`;

export const RUNNING_NEXT_FROM_GET = 'Review still running. Call get_findings again in ~30s.';

export const CONVENTIONS_EMPTY_ACCEPTED_NEXT =
  'No accepted conventions yet. Extract them in the DevDigest studio (repo → Conventions), or call get_conventions with status "pending".';

export const conventionsEmptyNext = (status: string, repo: string): string =>
  `No ${status} conventions for ${repo}.`;
