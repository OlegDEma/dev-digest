import { describe, expect, it } from 'vitest';
import {
  AGENT_ID,
  DISABLED_AGENT_ID,
  FakeApi,
  RUN_ID,
  blast,
  convention,
  finding,
  runDetail,
  runningDetail,
} from './fake-api.js';
import { connect, jsonOf, textOf } from './helpers.js';
import * as T from '../src/texts.js';
import { ApiError } from '../src/errors.js';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const runArgs = { repo: 'acme/widgets', pr: 7, agent: 'Security Reviewer' };

describe('tools/list', () => {
  it('lists the five tools in order with explicit annotations', async () => {
    const { client } = await connect(new FakeApi());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
    for (const t of tools) {
      expect(t.annotations).toEqual(t.name === 'run_agent_on_pr' ? WRITE : READ);
    }
    const runDesc = tools.find((t) => t.name === 'run_agent_on_pr')!.description;
    expect(runDesc).toContain('code review');
    expect(runDesc).toContain('pull request');
  });
});

describe('list_agents', () => {
  it('returns every agent, never the system prompt', async () => {
    const { client } = await connect(new FakeApi());
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    const text = textOf(res);
    expect(text).not.toContain('SECRET-PROMPT');
    expect(text).not.toContain('system_prompt');
    const body = jsonOf(res);
    expect(body.agents).toHaveLength(2);
    expect(body.agents.map((a: { enabled: boolean }) => a.enabled)).toEqual([true, false]);
    expect(Object.keys(body.agents[0]).sort()).toEqual(
      ['description', 'enabled', 'id', 'model', 'name', 'provider'],
    );
  });

  it('empty list leads forward', async () => {
    const api = new FakeApi();
    api.agents = [];
    const { client } = await connect(api);
    expect(jsonOf(await client.callTool({ name: 'list_agents', arguments: {} }))).toEqual({
      agents: [],
      next: T.AGENTS_EMPTY_NEXT,
    });
  });

  it('API down -> unreachable text with the configured url (AC-11)', async () => {
    const api = new FakeApi();
    api.failAll = new ApiError(null, 'unreachable', 'x');
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.unreachable('http://api.test'));
  });
});

describe('run_agent_on_pr', () => {
  it('done -> REVIEW with at most `limit` findings sorted by severity (AC-4)', async () => {
    const api = new FakeApi();
    api.runs = [
      runDetail({}, [
        finding(1, { severity: 'SUGGESTION', file: 'a.ts' }),
        finding(2, { severity: 'CRITICAL', file: 'z.ts' }),
        finding(3, { severity: 'WARNING', file: 'b.ts' }),
        finding(4, { severity: 'CRITICAL', file: 'a.ts' }),
      ]),
    ];
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: { ...runArgs, limit: 3 } });
    const body = jsonOf(res);
    expect(res.isError).toBeFalsy();
    expect(body).toMatchObject({ status: 'done', verdict: 'comment', score: 80, total: 4, next_offset: 3 });
    expect(body.findings.map((f: { severity: string; file: string }) => `${f.severity}:${f.file}`)).toEqual([
      'CRITICAL:a.ts',
      'CRITICAL:z.ts',
      'WARNING:b.ts',
    ]);
    expect(body.findings[0].rationale).toBeUndefined();
    expect(api.count('startReview')).toBe(1);
  });

  it('over the cap -> non-error RUNNING pointing at get_findings (AC-5)', async () => {
    const api = new FakeApi();
    const { client } = await connect(api, { runWaitSec: 0 });
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res)).toEqual({
      run_id: RUN_ID,
      agent: 'Security Reviewer',
      status: 'running',
      next: T.runningNextFromRun(0, RUN_ID),
    });
  });

  it('failed / cancelled -> isError run-outcome text (AC-6)', async () => {
    const api = new FakeApi();
    api.runs = [runDetail({ status: 'failed', error: 'no key', review: null })];
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.runFailed(RUN_ID, 'no key'));

    const api2 = new FakeApi();
    api2.runs = [runDetail({ status: 'cancelled', review: null })];
    const c2 = (await connect(api2)).client;
    const res2 = await c2.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(res2.isError).toBe(true);
    expect(textOf(res2)).toBe(T.runCancelled(RUN_ID));
  });

  it('re-attach adds "attached":true and does not POST (AC-9)', async () => {
    const api = new FakeApi();
    api.runs = [runDetail()];
    api.active = [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer', ran_at: null }];
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(jsonOf(res).attached).toBe(true);
    expect(api.count('startReview')).toBe(0);
  });

  it.each([
    ['repo', { ...runArgs, repo: 'nope/none' }, T.repoNotFound('nope/none', ['acme/widgets'])],
    ['pr', { ...runArgs, pr: 99 }, T.prNotFound(99, 'acme/widgets')],
    ['agent', { ...runArgs, agent: 'ghost' }, T.agentNotFound('ghost')],
    ['disabled agent', { ...runArgs, agent: 'Old Reviewer' }, T.agentDisabled('Old Reviewer')],
    ['disabled agent by id', { ...runArgs, agent: DISABLED_AGENT_ID }, T.agentDisabled('Old Reviewer')],
  ])('%s resolution error leads forward and makes no POST (AC-10)', async (_n, args, expected) => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: args });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(expected);
    expect(api.count('startReview')).toBe(0);
  });

  it('repo match is case-insensitive; no repos connected has its own text', async () => {
    const api = new FakeApi();
    api.runs = [runDetail()];
    const { client } = await connect(api);
    const ok = await client.callTool({ name: 'run_agent_on_pr', arguments: { ...runArgs, repo: 'ACME/Widgets' } });
    expect(ok.isError).toBeFalsy();

    const empty = new FakeApi();
    empty.repos = [];
    const res = await (await connect(empty)).client.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(textOf(res)).toBe(T.repoNotFoundNoRepos('acme/widgets'));
  });

  it('429 on start -> rate-limit text (AC-12)', async () => {
    const api = new FakeApi();
    api.startReview = async () => {
      throw new ApiError(429, 'rate_limited', 'x');
    };
    const res = await (await connect(api)).client.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.RATE_LIMITED);
  });

  it('progress notifications arrive with a progressToken, none without (AC-8)', async () => {
    const api = new FakeApi();
    api.runs = [runningDetail(), runningDetail(), runningDetail(), runDetail()];
    const { client } = await connect(api);
    const seen: unknown[] = [];
    await client.callTool({ name: 'run_agent_on_pr', arguments: runArgs }, undefined, {
      onprogress: (p) => seen.push(p),
    });
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toMatchObject({ total: 60, message: 'review running' });

    const api2 = new FakeApi();
    api2.runs = [runningDetail(), runningDetail(), runDetail()];
    const c2 = (await connect(api2)).client;
    let n = 0;
    c2.fallbackNotificationHandler = async (note) => {
      if (note.method === 'notifications/progress') n += 1;
    };
    await c2.callTool({ name: 'run_agent_on_pr', arguments: runArgs });
    expect(n).toBe(0);
  });

  it('a client abort reaches runReview: polling stops, no cancel call (AC-7)', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const ac = new AbortController();
    const p = client
      .callTool({ name: 'run_agent_on_pr', arguments: runArgs }, undefined, { signal: ac.signal })
      .catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 40));
    expect(api.count('getRun')).toBeGreaterThan(0);
    ac.abort();
    await p;
    await new Promise((r) => setTimeout(r, 30));
    const after = api.count('getRun');
    await new Promise((r) => setTimeout(r, 40));
    expect(api.count('getRun')).toBe(after);
    expect(api.getRunSignals[0]?.aborted).toBe(true);
    expect(api.calls.some((c) => /cancel/i.test(c))).toBe(false);
  });
});

describe('get_findings', () => {
  const run = (n: number) =>
    runDetail({}, Array.from({ length: n }, (_, i) => finding(i, { severity: 'WARNING' })));
  const call = (client: Awaited<ReturnType<typeof connect>>['client'], args: Record<string, unknown>) =>
    client.callTool({ name: 'get_findings', arguments: { run_id: RUN_ID, ...args } });

  it('pages with limit/offset and reports total/next_offset (AC-13)', async () => {
    const api = new FakeApi();
    api.runs = [run(25)];
    const { client } = await connect(api);
    const first = jsonOf(await call(client, { limit: 10 }));
    expect(first).toMatchObject({ total: 25, offset: 0, next_offset: 10 });
    expect(first.findings).toHaveLength(10);
    const last = jsonOf(await call(client, { limit: 10, offset: 20 }));
    expect(last.findings).toHaveLength(5);
    expect(last.next_offset).toBeNull();
  });

  it('detail "full" adds rationale and suggestion; brief does not', async () => {
    const api = new FakeApi();
    api.runs = [run(1)];
    const { client } = await connect(api);
    expect(jsonOf(await call(client, {})).findings[0].rationale).toBeUndefined();
    const full = jsonOf(await call(client, { detail: 'full' })).findings[0];
    expect(full.rationale).toBe('rationale 0');
    expect(full.suggestion).toBe('suggestion 0');
  });

  it('running -> RUNNING answer, not an error', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const res = await call(client, {});
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res).next).toBe(T.RUNNING_NEXT_FROM_GET);
  });

  it('failed -> isError; unknown run (404) leads forward', async () => {
    const api = new FakeApi();
    api.runs = [runDetail({ status: 'failed', error: null, review: null })];
    const { client } = await connect(api);
    const res = await call(client, {});
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.runFailed(RUN_ID, null));

    const api2 = new FakeApi();
    api2.runs = [new ApiError(404, 'not_found', 'Run not found')];
    const res2 = await call((await connect(api2)).client, {});
    expect(res2.isError).toBe(true);
    expect(textOf(res2)).toBe(T.runNotFound(RUN_ID));
  });

  it('500 findings -> valid JSON under 20,000 chars with truncated:true (AC-19)', async () => {
    const api = new FakeApi();
    const long = 'x'.repeat(900);
    api.runs = [
      runDetail({}, Array.from({ length: 500 }, (_, i) => finding(i, { rationale: long, suggestion: long }))),
    ];
    const { client } = await connect(api);
    const res = await call(client, { limit: 100, detail: 'full' });
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(20_000);
    const body = JSON.parse(text);
    expect(body.truncated).toBe(true);
    expect(body.next_offset).toBe(body.findings.length);
    expect(body.findings.length).toBeLessThan(100);
  });
});

describe('get_conventions', () => {
  const setup = () => {
    const api = new FakeApi();
    api.conventions = [convention(1, 'accepted'), convention(2, 'pending'), convention(3, 'rejected')];
    return api;
  };

  it('defaults to accepted; "all" returns every status (AC-16)', async () => {
    const { client } = await connect(setup());
    const def = jsonOf(await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets' } }));
    expect(def).toMatchObject({ repo: 'acme/widgets', status: 'accepted', total: 1 });
    expect(def.conventions[0]).toEqual({
      category: 'naming',
      rule: 'rule 1',
      evidence_path: 'src/c1.ts',
      evidence_line: 1,
    });
    const all = jsonOf(
      await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets', status: 'all' } }),
    );
    expect(all.total).toBe(3);
  });

  it('empty results carry a next hint per status', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const acc = jsonOf(await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets' } }));
    expect(acc.next).toBe(T.CONVENTIONS_EMPTY_ACCEPTED_NEXT);
    const rej = jsonOf(
      await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/widgets', status: 'rejected' } }),
    );
    expect(rej.next).toBe(T.conventionsEmptyNext('rejected', 'acme/widgets'));
  });
});

describe('get_blast_radius', () => {
  const args = { repo: 'acme/widgets', pr: 7 };

  it('returns the same map as the route, callers as compact strings', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'get_blast_radius', arguments: args });
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res)).toEqual({
      repo: 'acme/widgets',
      pr: 7,
      summary: blast.summary,
      scope: 'direct callers (depth 1), max 20 per symbol',
      counts: blast.counts,
      degraded: false,
      reason: null,
      downstream: [
        {
          symbol: 'getContext',
          callers: ['src/intent/routes.ts:22 intentRoutes', 'src/blast/routes.ts:14 blastRoutes'],
          endpoints: ['GET /pulls/:id/blast', 'GET /pulls/:id/intent'],
          crons: [],
        },
        { symbol: 'RequestContext', callers: [], endpoints: [], crons: [] },
      ],
    });
  });

  it('unknown PR is an error naming this tool, and never reaches getBlast', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { ...args, pr: 99 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.prNotFound(99, 'acme/widgets', 'get_blast_radius'));
    expect(api.count('getBlast')).toBe(0);
  });

  it('adds a next hint when the index is off or partial', async () => {
    const api = new FakeApi();
    api.blast = { ...blast, degraded: true, reason: 'flag_off' };
    const { client } = await connect(api);
    expect(jsonOf(await client.callTool({ name: 'get_blast_radius', arguments: args })).next).toBe(
      T.BLAST_FLAG_OFF_NEXT,
    );
    api.blast = { ...blast, degraded: true, reason: 'index_partial' };
    expect(jsonOf(await client.callTool({ name: 'get_blast_radius', arguments: args })).next).toBe(
      T.BLAST_PARTIAL_NEXT,
    );
  });

  it('no_data and the other reasons each get their own hint', async () => {
    const api = new FakeApi();
    const { client } = await connect(api);
    for (const [reason, next] of [
      ['no_data', T.BLAST_NO_DATA_NEXT],
      ['index_failed', T.BLAST_INDEX_FAILED_NEXT],
      ['repo_too_large', T.BLAST_TOO_LARGE_NEXT],
    ] as const) {
      api.blast = { ...blast, degraded: true, reason };
      expect(jsonOf(await client.callTool({ name: 'get_blast_radius', arguments: args })).next).toBe(next);
    }
  });

  it('passes truncated through only when a group was cut', async () => {
    const api = new FakeApi();
    api.blast = { ...blast, downstream: blast.downstream.map((d, i) => ({ ...d, truncated: i === 0 })) };
    const { client } = await connect(api);
    const out = jsonOf(await client.callTool({ name: 'get_blast_radius', arguments: args }));
    expect(out.downstream[0].truncated).toBe(true);
    expect(out.downstream[1].truncated).toBeUndefined();
  });

  it('a route 404 becomes an API-error text', async () => {
    const api = new FakeApi();
    api.blastError = new ApiError(404, 'not_found', 'Pull request not found');
    const { client } = await connect(api);
    const res = await client.callTool({ name: 'get_blast_radius', arguments: args });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(T.apiError(404, 'not_found', 'Pull request not found'));
  });
});
