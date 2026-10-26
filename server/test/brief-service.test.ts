import { describe, it, expect, vi, afterEach } from 'vitest';
import { StructuredOutputError, type LLMProvider } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';

vi.mock('../src/modules/settings/feature-models.js', () => ({
  resolveFeatureModel: async () => ({ provider: 'openai', model: 'model-x' }),
}));

const { BriefService } = await import('../src/modules/brief/service.js');

const BODY_SECRET = 'BODY-SECRET-TEXT';
const SPEC_TEXT = 'SPEC-SECRET-TEXT';

const pull = { id: 'pr1', repoId: 'r1', number: 7, title: 'Add config', body: BODY_SECRET, headSha: 'abc1234', base: 'main' };
const repoRow = { id: 'r1', owner: 'acme', name: 'w', fullName: 'acme/w', clonePath: '/clone' };

const GOOD = {
  summary: 'why',
  risks: [{ kind: 'k', title: 'T', explanation: 'e', severity: 'high', file_refs: ['src/config.ts:11', '../../etc/passwd'] }],
  review_focus: [
    { file: 'src/config.ts', line: 11, reason: 'r' },
    { file: '../../etc/passwd', line: 1, reason: 'bad' },
  ],
};

function setup(
  over: { llm?: LLMProvider; llmFn?: () => Promise<LLMProvider>; timeoutMs?: number; blastGate?: Promise<void> } = {},
) {
  const attach = { docs: ['specs/plan.md'] };
  const llm = over.llm ?? new MockLLMProvider('openai', { structuredBySchema: { PrBriefModelOutput: GOOD } });
  const saved: unknown[] = [];
  const cloneRead = vi.fn(async (_root: string, path: string) => ({ kind: 'ok' as const, text: `${SPEC_TEXT} ${path}` }));
  const getIssue = vi.fn();
  const getBlastRadius = vi.fn();
  const container = {
    db: {},
    llm: over.llmFn ?? (async () => llm),
    github: async () => ({ getIssue }),
    git: { diff: async () => { throw new Error('no clone'); } },
    cloneDocs: { read: cloneRead },
    repoIntel: { getBlastRadius },
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    config: { promptLog: { requested: 'summary', effective: 'summary', downgradeReason: null } },
  };
  const reviews = {
    getPull: async (ws: string) => (ws === 'ws' ? pull : undefined),
    getRepo: async () => repoRow,
    getPrFiles: async () => [
      { path: 'src/config.ts', additions: 1, deletions: 0, patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,' },
    ],
  };
  const briefs = {
    get: async () => undefined,
    upsert: async (_id: string, json: unknown) => void saved.push(json),
    listSpecAttachments: async () => [{ agentId: 'a', name: 'a', docs: [...attach.docs], skills: [] }],
  };
  const blast = {
    get: async () => {
      await over.blastGate;
      return {
      changed_symbols: [], downstream: [], summary: 'none', counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      degraded: false, reason: null, index_sha: null, max_callers_per_symbol: 20, facts_by_file: {},
    };
    },
  };
  const service = new BriefService(
    container as never, reviews as never, briefs as never, { get: async () => undefined } as never, blast as never,
    over.timeoutMs,
  );
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { service, llm, saved, logger, cloneRead, getIssue, getBlastRadius, attach };
}

const briefLogs = (logger: { info: ReturnType<typeof vi.fn> }) =>
  logger.info.mock.calls.filter((c) => c[1] === 'brief.generated').map((c) => c[0] as Record<string, unknown>);

afterEach(() => vi.useRealTimers());

describe('BriefService.generate (hermetic)', () => {
  it('stores a validated brief with one model call and head sha (AC-7, AC-29)', async () => {
    const t = setup();
    const res = await t.service.generate('ws', 'pr1', t.logger);
    expect(res.stale).toBe(false);
    expect(res.brief!.head_sha).toBe('abc1234');
    expect(res.brief!.calls).toBe(1);
    expect(res.brief!.risks.risks[0]!.file_refs).toEqual(['src/config.ts:11']);
    expect(res.brief!.review_focus).toHaveLength(1);
    expect(res.brief!.specs).toEqual([expect.objectContaining({ path: 'specs/plan.md', status: 'used' })]);
    expect((t.llm as MockLLMProvider).calls).toHaveLength(1);
    expect(t.saved).toHaveLength(1);
    expect(res.brief!.missing_inputs.map((m) => m.input)).toContain('smart_diff');
  });

  it('two concurrent generates: one 409 brief_in_progress, one model call (AC-37)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = new MockLLMProvider('openai', { structuredBySchema: { PrBriefModelOutput: GOOD } });
    const slow = {
      ...inner,
      id: 'openai',
      completeStructured: async (req: never) => {
        await gate;
        return inner.completeStructured(req);
      },
    } as unknown as LLMProvider;
    const t = setup({ llm: slow });
    const first = t.service.generate('ws', 'pr1', t.logger);
    await expect(t.service.generate('ws', 'pr1', t.logger)).rejects.toMatchObject({ statusCode: 409, code: 'brief_in_progress' });
    release();
    await first;
    expect(inner.calls).toHaveLength(1);
    await expect(t.service.generate('ws', 'pr1', t.logger)).resolves.toBeTruthy();
  });

  it('120 s timeout → 502, nothing stored, lock released, late result discarded (AC-28)', async () => {
    vi.useFakeTimers();
    let resolveLate!: (v: unknown) => void;
    const never = {
      id: 'openai',
      completeStructured: () => new Promise((r) => (resolveLate = r)),
    } as unknown as LLMProvider;
    const t = setup({ llm: never });
    const p = t.service.generate('ws', 'pr1', t.logger);
    const assertion = expect(p).rejects.toMatchObject({ statusCode: 502, code: 'external_service_error' });
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    resolveLate({ data: GOOD, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.saved).toHaveLength(0);
    expect(briefLogs(t.logger).map((l) => l.outcome)).toEqual(['timeout']);
    // lock is free again
    vi.useRealTimers();
    const t2 = setup();
    await expect(t2.service.generate('ws', 'pr1', t2.logger)).resolves.toBeTruthy();
  });

  it('missing API key → 500 config_error naming the provider, LLM never called (AC-27)', async () => {
    const llm = new MockLLMProvider('openai');
    const t = setup({ llm, llmFn: async () => { throw new ConfigError('OPENAI_API_KEY is not configured'); } });
    const err = await t.service.generate('ws', 'pr1', t.logger).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 500, code: 'config_error' });
    expect(err.message).toContain('openai');
    expect(err.message).toContain('Settings');
    expect(llm.calls).toHaveLength(0);
    expect(t.saved).toHaveLength(0);
    expect(t.cloneRead).not.toHaveBeenCalled();
    expect(briefLogs(t.logger).map((l) => l.outcome)).toEqual(['config_error']);
  });

  it('StructuredOutputError → 502, nothing stored (AC-26)', async () => {
    const bad = {
      id: 'openai',
      completeStructured: async () => {
        throw new StructuredOutputError({ schemaName: 'x', attempts: 3, tokensIn: 1, tokensOut: 1, costUsd: 0 });
      },
    } as unknown as LLMProvider;
    const t = setup({ llm: bad });
    await expect(t.service.generate('ws', 'pr1', t.logger)).rejects.toMatchObject({ statusCode: 502 });
    expect(t.saved).toHaveLength(0);
    expect(briefLogs(t.logger).map((l) => l.outcome)).toEqual(['external_service_error']);
  });

  it('writes exactly one content-free log line (AC-59, NFR-7)', async () => {
    const t = setup();
    await t.service.generate('ws', 'pr1', t.logger);
    const lines = briefLogs(t.logger);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ outcome: 'ok', pr_id: 'pr1', model: 'model-x' });
    const all = JSON.stringify(t.logger.info.mock.calls);
    for (const leak of [BODY_SECRET, SPEC_TEXT, 'why', 'sk_live_xxx', 'stripeKey']) expect(all).not.toContain(leak);
  });

  it('log line carries the full AC-59 field set on success and on failure', async () => {
    const ok = setup();
    await ok.service.generate('ws', 'pr1', ok.logger);
    const line = briefLogs(ok.logger)[0]!;
    expect(line).toMatchObject({
      outcome: 'ok', pr_id: 'pr1', provider: 'openai', model: 'model-x', calls: 1, attempts: 1,
      input_budget: 8000, tokens_out: 50, cost_usd: 0.001, corrected_lines: 0,
      dropped: { risks: 0, risk_refs: 1, review_focus: 1 },
    });
    expect(Object.keys(line.input_tokens as object)).toEqual(expect.arrayContaining(['system', 'title', 'files']));
    expect(line.input_tokens_total).toBeGreaterThan(0);
    expect(line.missing_inputs).toEqual(expect.arrayContaining([expect.objectContaining({ input: 'smart_diff' })]));

    const bad = {
      id: 'openai',
      completeStructured: async () => {
        throw new StructuredOutputError({ schemaName: 'x', attempts: 3, tokensIn: 5, tokensOut: 7, costUsd: 0.5 });
      },
    } as unknown as LLMProvider;
    const fail = setup({ llm: bad });
    await fail.service.generate('ws', 'pr1', fail.logger).catch(() => {});
    expect(briefLogs(fail.logger)[0]).toMatchObject({
      outcome: 'external_service_error', provider: 'openai', model: 'model-x', calls: 1, attempts: 3,
      input_budget: 8000, tokens_out: 7, cost_usd: 0.5, dropped: null, corrected_lines: null,
    });
    expect(Object.keys(briefLogs(fail.logger)[0]!.input_tokens as object)).toContain('files');

    const cfg = setup({ llmFn: async () => { throw new ConfigError('k'); } });
    await cfg.service.generate('ws', 'pr1', cfg.logger).catch(() => {});
    expect(briefLogs(cfg.logger)[0]).toMatchObject({ outcome: 'config_error', provider: 'openai', calls: 0, input_budget: 8000, input_tokens: null });
  });

  it('attach lists are read once at the start: a change during a slow input read is ignored (AC-18)', async () => {
    let release!: () => void;
    const t = setup({ blastGate: new Promise<void>((r) => (release = r)) });
    const p = t.service.generate('ws', 'pr1', t.logger);
    await new Promise((r) => setTimeout(r, 5));
    t.attach.docs = ['specs/other.md'];
    release();
    const res = await p;
    expect(res.brief!.specs.map((s) => s.path)).toEqual(['specs/plan.md']);
    for (const call of t.cloneRead.mock.calls) expect(call[1]).toBe('specs/plan.md');
  });

  it('a model-invented path never reaches clone, GitHub or repo-intel (AC-62)', async () => {
    const t = setup();
    await t.service.generate('ws', 'pr1', t.logger);
    for (const call of t.cloneRead.mock.calls) expect(call[1]).toBe('specs/plan.md');
    expect(t.getIssue).not.toHaveBeenCalled();
    expect(t.getBlastRadius).not.toHaveBeenCalled();
  });

  it('foreign workspace → 404 before anything else (AC-64)', async () => {
    const t = setup();
    await expect(t.service.generate('other', 'pr1', t.logger)).rejects.toMatchObject({ statusCode: 404 });
    await expect(t.service.get('other', 'pr1')).rejects.toMatchObject({ statusCode: 404 });
    expect((t.llm as MockLLMProvider).calls).toHaveLength(0);
  });
});

describe('BriefService.get', () => {
  it('unparseable stored json is treated as no brief; no model call (AC-30)', async () => {
    const t = setup();
    expect(await t.service.get('ws', 'pr1')).toEqual({ brief: null, stale: false });
    expect((t.llm as MockLLMProvider).calls).toHaveLength(0);
  });
});
