import { describe, it, expect, vi } from 'vitest';
import type { PrIntentRecord } from '@devdigest/shared';
import { MockLLMProvider, MockGitHubClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

vi.mock('../src/modules/settings/feature-models.js', () => ({
  resolveFeatureModel: async () => ({ provider: 'openrouter', model: 'openai/gpt-6-luna' }),
}));

const { IntentService } = await import('../src/modules/intent/service.js');

const SECRET_QUERY = 'token=TOPSECRET';
const BODY = `Adds rate limiting. Plan: specs/plan.md and https://ok.test/page and https://down.test/x?${SECRET_QUERY}. Closes #4`;
const DOC = 'DOC-BODY-UNIQUE plan text';

const diff = parseUnifiedDiff(
  [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@ function foo()',
    ' context-line',
    '-removed-line',
    '+added-line',
  ].join('\n'),
);

const modelIntent = {
  summary: 's',
  in_scope: ['a'],
  out_of_scope: [],
  risk_areas: [],
  missing_context: [],
  confidence: 'high',
};

function setup(body: string) {
  const llm = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: modelIntent } });
  const github = new MockGitHubClient({ files: { 'specs/plan.md': DOC } });
  const saved: PrIntentRecord[] = [];
  const container = {
    db: {},
    llm: async () => llm,
    github: async () => github,
    urlFetcher: {
      fetch: async (url: string) => {
        if (url.startsWith('https://down.test')) throw new Error(`Fetch failed (HTTP 500) ${url}`);
        return { bytes: new TextEncoder().encode('<p>ok page</p>'), filename: 'page.html' };
      },
    },
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    config: { promptLog: { requested: 'summary', effective: 'summary', downgradeReason: null } },
  };
  const service = new IntentService(
    container as never,
    {} as never,
    { get: async () => undefined, upsert: async (r: PrIntentRecord) => void saved.push(r) } as never,
  );
  const logs: { msg: string; data?: unknown }[] = [];
  const log = {
    info: (msg: string, data?: unknown) => void logs.push({ msg, data }),
    error: (msg: string, data?: unknown) => void logs.push({ msg, data }),
  };
  const pull = { id: 'pr1', number: 7, title: 'Rate limit', body, headSha: 'abcdef1234' };
  const repo = { owner: 'acme', name: 'widgets' };
  return { service, llm, saved, logs, log, pull, repo };
}

describe('IntentService.derive (hermetic)', () => {
  it('classifier sees file list + doc, never diff body lines; unresolved → missing_context + medium', async () => {
    const t = setup(BODY);
    const rec = await t.service.derive('ws', t.pull as never, t.repo as never, diff, t.log);

    const req = t.llm.calls[0]!.req as {
      schemaName: string;
      requireParameters: boolean;
      messages: { content: string }[];
    };
    expect(req.schemaName).toBe('PrIntent');
    expect(req.requireParameters).toBe(true);
    const prompt = req.messages.map((m) => m.content).join('\n');
    expect(prompt).not.toContain('removed-line');
    expect(prompt).not.toContain('added-line');
    expect(prompt).not.toContain('context-line');
    expect(prompt).toContain('@@ -1,2 +1,3 @@ function foo()');
    expect(prompt).toContain(DOC);

    const doc = rec.sources.find((s) => s.kind === 'repo_doc')!;
    expect(doc).toMatchObject({ ref: 'specs/plan.md', status: 'used' });
    expect(doc.tokens).toBeGreaterThan(0);
    const down = rec.sources.find((s) => s.kind === 'url' && s.status === 'unresolved')!;
    expect(down.ref).toBe('https://down.test/x');
    expect(down.reason).toBeTruthy();
    expect(rec.missing_context).toContain('https://down.test/x');
    expect(rec.confidence).toBe('medium');
    expect(rec.head_sha).toBe('abcdef1234');
    expect(t.saved).toHaveLength(1);
    expect(rec.diff_tokens_saved).toBeDefined();
  });

  it('emits exactly one content-free prompt.assembled record and tags the Live Log with its call_id', async () => {
    const t = setup(BODY);
    const spy = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await t.service.derive('ws', t.pull as never, t.repo as never, diff, t.log, {
      logger: spy,
      runIds: ['r1'],
    });
    const recs = spy.info.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((r) => r.event === 'prompt.assembled');
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ feature: 'intent', run_ids: ['r1'], pr_id: 'pr1' });
    expect(recs[0]).not.toHaveProperty('session_id');
    const json = JSON.stringify(recs[0]);
    for (const leak of ['DOC', 'added-line', 'TOPSECRET', 'acme', 'widgets']) expect(json).not.toContain(leak);
    const composition = t.logs.find((l) => l.msg.startsWith('Intent classifier'))!;
    expect(composition.msg).toContain(`call_id=${recs[0]!.call_id}`);
  });

  it('does not fetch issues from another repository with the workspace token', async () => {
    const t = setup('Fixes other-org/private#1 and closes #3');
    const rec = await t.service.derive('ws', t.pull as never, t.repo as never, diff, t.log);
    const foreign = rec.sources.find((s) => s.ref === 'other-org/private#1')!;
    expect(foreign).toMatchObject({ kind: 'issue', status: 'unresolved' });
    expect(foreign.reason).toMatch(/another repository/);
    expect(rec.sources.find((s) => s.ref === 'acme/widgets#3')).toBeDefined();
  });

  it('empty body → low confidence', async () => {
    const t = setup('');
    const rec = await t.service.derive('ws', { ...t.pull, body: '' } as never, t.repo as never, diff, t.log);
    expect(rec.confidence).toBe('low');
    expect(rec.sources.find((s) => s.kind === 'pr_body')!.status).toBe('skipped');
  });

  it('logs composition + sources but no body text, doc text, hunk lines or query strings', async () => {
    const t = setup(BODY);
    await t.service.derive('ws', t.pull as never, t.repo as never, diff, t.log);
    const logged = JSON.stringify(t.logs);
    expect(logged).toContain('diff_tokens_saved');
    expect(logged).toContain('openai/gpt-6-luna');
    expect(logged).not.toContain('Adds rate limiting');
    expect(logged).not.toContain('DOC-BODY-UNIQUE');
    expect(logged).not.toContain('TOPSECRET');
    expect(logged).not.toContain('removed-line');
    expect(logged).not.toContain('added-line');
  });

  it('forReview is non-fatal when the classifier fails', async () => {
    const t = setup(BODY);
    t.llm.completeStructured = async () => {
      throw new Error('no endpoints');
    };
    const out = await t.service.forReview('ws', t.pull as never, t.repo as never, diff, t.log);
    expect(out).toBeUndefined();
    expect(t.logs.at(-1)!.msg).toContain('Intent classification failed');
  });
});
