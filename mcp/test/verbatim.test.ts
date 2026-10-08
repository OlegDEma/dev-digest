// Literal copies of spec 11 §7b. Do NOT import these from src/texts.ts — the point is to
// catch drift. Change the spec first, then both this file and texts.ts.
import { describe, expect, it } from 'vitest';
import { toToolError, ApiError, ToolFailure } from '../src/errors.js';
import { agentsAnswer, conventionsAnswer, notImplementedAnswer, reviewAnswer, runningAnswer } from '../src/format.js';
import * as T from '../src/texts.js';
import { FakeApi, RUN_ID, convention, finding, runDetail } from './fake-api.js';
import { connect, textOf } from './helpers.js';

const UUID = '55555555-5555-4555-8555-555555555555';

describe('tools/list wording', () => {
  it('instructions, titles, descriptions and .describe() strings are byte-identical to §7b', async () => {
    const { client } = await connect(new FakeApi());
    expect(client.getInstructions()).toBe(
      'DevDigest code review via the local API. Address a PR as repo "owner/name" + pr number. Get an agent from list_agents. run_agent_on_pr runs it and waits up to 2 min; if it answers status "running", call get_findings(run_id) later.',
    );
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    const desc = (name: string, prop: string): unknown =>
      (by[name]!.inputSchema.properties as Record<string, { description?: string }>)[prop]?.description;

    expect(by['list_agents']!.title).toBe('List reviewer agents');
    expect(by['list_agents']!.description).toBe(
      "List the configured code review agents (e.g. security, bug or style reviewers). Use an agent's name or id as the agent argument of run_agent_on_pr.",
    );

    expect(by['run_agent_on_pr']!.title).toBe('Run a review on a PR');
    expect(by['run_agent_on_pr']!.description).toBe(
      'Run a code review of a GitHub pull request (PR) with one reviewer agent, wait up to 2 min and return the verdict and security/bug findings. If still running, returns run_id for get_findings.',
    );
    expect(desc('run_agent_on_pr', 'repo')).toBe('GitHub repo as owner/name');
    expect(desc('run_agent_on_pr', 'pr')).toBe('Pull request number');
    expect(desc('run_agent_on_pr', 'agent')).toBe('Agent name or id from list_agents');
    expect(desc('run_agent_on_pr', 'limit')).toBe('Max findings to return');

    expect(by['get_findings']!.title).toBe('Get findings of a run');
    expect(by['get_findings']!.description).toBe(
      'Get the verdict and code review findings (severity, file, line) of a PR review run started by run_agent_on_pr. Pages with limit/offset.',
    );
    expect(desc('get_findings', 'run_id')).toBe('run_id returned by run_agent_on_pr');
    expect(desc('get_findings', 'limit')).toBe('Max findings to return');
    expect(desc('get_findings', 'offset')).toBeUndefined();
    expect(desc('get_findings', 'detail')).toBe('full adds rationale and suggestion');

    expect(by['get_conventions']!.title).toBe('Get repo conventions');
    expect(by['get_conventions']!.description).toBe(
      'Get the coding conventions and style rules extracted for a GitHub repo, used by code review (accepted ones by default).',
    );
    expect(desc('get_conventions', 'repo')).toBe('GitHub repo as owner/name');
    expect(desc('get_conventions', 'status')).toBeUndefined();
    expect(desc('get_conventions', 'limit')).toBeUndefined();

    expect(by['get_blast_radius']!.title).toBe('PR blast radius (not implemented)');
    expect(by['get_blast_radius']!.description).toBe(
      'Not implemented yet. Will map which files and symbols a pull request (PR) affects.',
    );
    expect(desc('get_blast_radius', 'repo')).toBe('GitHub repo as owner/name');
    expect(desc('get_blast_radius', 'pr')).toBe('Pull request number');
  });
});

describe('error and result templates', () => {
  const err = (e: unknown) => textOf(toToolError(e, 'http://localhost:3001'));

  it('shared API errors', () => {
    expect(err(new ApiError(null, 'unreachable', 'x'))).toBe(
      'DevDigest API not reachable at http://localhost:3001. Start it with ./scripts/dev.sh (or set DEVDIGEST_API_URL), then retry.',
    );
    expect(err(new ApiError(429, 'rate_limited', 'x'))).toBe(
      'Rate limited by the DevDigest API (review runs: 10 per minute). Wait a minute, then retry.',
    );
    expect(err(new ApiError(500, 'boom', 'it broke'))).toBe('DevDigest API error 500 boom: it broke');
    expect(T.repoNotFound('a/b', ['x/y', 'z/w'])).toBe(
      "Repo 'a/b' not found. Known repos: x/y, z/w. Use one of them as repo (owner/name).",
    );
    expect(T.repoNotFound('a/b', Array.from({ length: 12 }, (_, i) => `r/${i}`))).toContain(
      'r/0, r/1, r/2, r/3, r/4, r/5, r/6, r/7, r/8, r/9. Use',
    );
    expect(T.repoNotFoundNoRepos('a/b')).toBe(
      "Repo 'a/b' not found and no repos are connected. Add the repo in the DevDigest studio first.",
    );
  });

  it('run-outcome and per-tool errors', () => {
    expect(T.runFailed(UUID, 'no key')).toBe(
      `Review run ${UUID} failed: no key. Fix the cause (e.g. the provider API key in Settings), then call run_agent_on_pr again.`,
    );
    expect(T.runFailed(UUID, null)).toBe(
      `Review run ${UUID} failed: unknown error. Fix the cause (e.g. the provider API key in Settings), then call run_agent_on_pr again.`,
    );
    expect(T.runCancelled(UUID)).toBe(
      `Review run ${UUID} was cancelled. Call run_agent_on_pr to start a new one.`,
    );
    expect(T.prNotFound(7, 'a/b')).toBe(
      'PR #7 not found in a/b. Check the number with gh pr list --repo a/b; if it is listed, open the PR in the DevDigest studio to sync it, then call run_agent_on_pr again.',
    );
    expect(T.agentNotFound('ghost')).toBe("Agent 'ghost' not found. Call list_agents to get a valid name or id.");
    expect(T.agentDisabled('Old')).toBe(
      "Agent 'Old' is disabled. Enable it in the DevDigest studio, or call list_agents and pick an enabled agent.",
    );
    expect(T.lostContact(UUID)).toBe(
      `Lost contact with the DevDigest API while waiting. The review keeps running; call get_findings with run_id "${UUID}" in ~30s.`,
    );
    expect(T.runNotFound(UUID)).toBe(
      `Run '${UUID}' not found. Use a run_id returned by run_agent_on_pr, or call run_agent_on_pr to start a review.`,
    );
    expect(T.BLAST_RADIUS_NEXT).toBe(
      'get_blast_radius is not implemented yet. Use run_agent_on_pr or get_findings for review results.',
    );
    expect(err(new ToolFailure('already final'))).toBe('already final');
  });

  it('success templates render with the exact key order and next strings', () => {
    const review = reviewAnswer(
      runDetail({}, [finding(1, { severity: 'CRITICAL', category: 'security', file: 'a.ts', start_line: 3, end_line: 4, title: 'T' })]),
      { limit: 20, offset: 0, detail: 'brief' },
    );
    expect(review).toBe(
      `{"run_id":"${RUN_ID}","agent":"Security Reviewer","status":"done","verdict":"comment","score":80,"summary":"looks ok","total":1,"offset":0,"next_offset":null,"findings":[{"severity":"CRITICAL","category":"security","file":"a.ts","start_line":3,"end_line":4,"title":"T"}]}`,
    );
    const full = reviewAnswer(
      runDetail({}, [finding(1, { severity: 'CRITICAL', category: 'security', file: 'a.ts', start_line: 3, end_line: 4, title: 'T', rationale: 'R', suggestion: null })]),
      { limit: 20, offset: 0, detail: 'full', attached: true },
    );
    expect(full).toContain('"status":"done","attached":true,"verdict"');
    expect(full).toContain('"title":"T","rationale":"R","suggestion":null}]}');

    expect(runningAnswer(UUID, 'A', T.runningNextFromRun(120, UUID))).toBe(
      `{"run_id":"${UUID}","agent":"A","status":"running","next":"Review still running after 120s. Call get_findings with run_id \\"${UUID}\\" in ~30s."}`,
    );
    expect(runningAnswer(UUID, 'A', T.RUNNING_NEXT_FROM_GET)).toBe(
      `{"run_id":"${UUID}","agent":"A","status":"running","next":"Review still running. Call get_findings again in ~30s."}`,
    );
    expect(notImplementedAnswer(T.BLAST_RADIUS_NEXT)).toBe(
      '{"status":"not_implemented","next":"get_blast_radius is not implemented yet. Use run_agent_on_pr or get_findings for review results."}',
    );
    expect(agentsAnswer([])).toBe(
      '{"agents":[],"next":"No agents configured. Create one in the DevDigest studio (Agents page)."}',
    );
    expect(conventionsAnswer('a/b', 'accepted', [], 50)).toBe(
      '{"repo":"a/b","status":"accepted","total":0,"conventions":[],"next":"No accepted conventions yet. Extract them in the DevDigest studio (repo → Conventions), or call get_conventions with status \\"pending\\"."}',
    );
    expect(conventionsAnswer('a/b', 'pending', [], 50)).toBe(
      '{"repo":"a/b","status":"pending","total":0,"conventions":[],"next":"No pending conventions for a/b."}',
    );
    expect(conventionsAnswer('a/b', 'accepted', [convention(1, 'accepted')], 50)).toBe(
      '{"repo":"a/b","status":"accepted","total":1,"conventions":[{"category":"naming","rule":"rule 1","evidence_path":"src/c1.ts","evidence_line":1}]}',
    );
  });
});
