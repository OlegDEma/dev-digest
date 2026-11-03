import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CiResultArtifact, type LLMProvider } from '@devdigest/shared';
import { runCi, type RunCiDeps } from '../src/run.js';
import { loadManifest } from '../src/manifest.js';
import { loadSkillBlocks } from '../src/skills.js';
import { RunnerError } from '../src/errors.js';
import { makeLlm } from '../src/llm.js';

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const secret = 'sk_live_x';
 const b = 2;
`;

const finding = (severity: string) => ({
  id: 'f1',
  severity,
  category: 'security',
  title: 'Hardcoded secret',
  file: 'src/a.ts',
  start_line: 2,
  end_line: 2,
  rationale: 'secret in diff',
  confidence: 0.9,
  kind: 'finding',
});

function stubLlm(findings: unknown[], opts: { throws?: boolean } = {}): { llm: LLMProvider; calls: { n: number; system: string } } {
  const calls = { n: 0, system: '' };
  const llm = {
    id: 'openrouter',
    async completeStructured(req: { messages: { role: string; content: string }[] }) {
      calls.n++;
      calls.system = req.messages.map((m) => m.content).join('\n');
      if (opts.throws) throw new Error('llm exploded');
      return {
        data: { verdict: 'comment', summary: 'ok', score: 50, findings },
        model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null, raw: '{}', attempts: 1,
      };
    },
  } as unknown as LLMProvider;
  return { llm, calls };
}

let dir: string;
let ddir: string;
let result: string;
let posts: { url: string; method: string; body: unknown }[];
let env: NodeJS.ProcessEnv;

const fakeFetch = (async (url: string, init?: RequestInit) => {
  if (!init?.method || init.method === 'GET') return new Response(DIFF, { status: 200 });
  posts.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
  return new Response('{}', { status: 200 });
}) as unknown as typeof fetch;

function manifest(extra: Record<string, unknown> = {}, yamlText?: string) {
  mkdirSync(path.join(ddir, 'agents'), { recursive: true });
  const body = yamlText ?? JSON.stringify({ name: 'Sec', provider: 'openrouter', model: 'm', system_prompt: 'be strict', ...extra });
  writeFileSync(path.join(ddir, 'agents', 'sec.yaml'), body);
}

function deps(llm: LLMProvider, over: Partial<RunCiDeps> = {}): RunCiDeps {
  return { env, devdigestDir: ddir, resultPath: result, makeLlm: () => llm, fetchImpl: fakeFetch, log: () => {}, ...over };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'runner-'));
  ddir = path.join(dir, '.devdigest');
  result = path.join(dir, 'devdigest-result.json');
  posts = [];
  const event = path.join(dir, 'event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: 7 } }));
  env = { GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: event, GITHUB_TOKEN: 'ghs_SECRET_TOKEN', GITHUB_SHA: 'abcdef123456' };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('runCi', () => {
  it('manifest without post_as -> a review is posted (AC-B11a)', async () => {
    manifest();
    const { llm } = stubLlm([finding('WARNING')]);
    const r = await runCi(deps(llm));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain('/pulls/7/reviews');
    expect((posts[0]!.body as { event: string }).event).toBe('COMMENT');
    expect(r.exitCode).toBe(0);
  });

  it('post_as: pr_comment -> an issue comment, not a review', async () => {
    manifest({ post_as: 'pr_comment' });
    await runCi(deps(stubLlm([finding('WARNING')]).llm));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain('/issues/7/comments');
  });

  it('post_as: none -> no post call (AC-B11a)', async () => {
    manifest({ post_as: 'none' });
    const { llm, calls } = stubLlm([finding('WARNING')]);
    const r = await runCi(deps(llm));
    expect(calls.n).toBe(1);
    expect(posts).toHaveLength(0);
    expect(r.artifact.findings_count).toBe(1);
  });

  it('exit code follows ci_fail_on (AC-B11b)', async () => {
    manifest({ ci_fail_on: 'critical' });
    expect((await runCi(deps(stubLlm([finding('CRITICAL')]).llm))).exitCode).toBe(1);
    expect((await runCi(deps(stubLlm([finding('WARNING')]).llm))).exitCode).toBe(0);
    manifest({ ci_fail_on: 'never' });
    expect((await runCi(deps(stubLlm([finding('CRITICAL')]).llm))).exitCode).toBe(0);
  });

  it('artifact validates with CiResultArtifact and is written (AC-B12)', async () => {
    manifest({ ci_fail_on: 'never' });
    await runCi(deps(stubLlm([finding('CRITICAL'), { ...finding('WARNING'), id: 'f2', start_line: 3, end_line: 3 }]).llm));
    const a = CiResultArtifact.parse(JSON.parse(readFileSync(result, 'utf8')));
    expect(a).toMatchObject({ findings_count: 2, critical: 1, warning: 1, suggestion: 0, agent: 'Sec', pr_number: 7, version: 'abcdef1' });
    expect(a.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('artifact is still written when the LLM throws; exit 1 (AC-B12)', async () => {
    manifest();
    const r = await runCi(deps(stubLlm([], { throws: true }).llm));
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('llm exploded');
    expect(existsSync(result)).toBe(true);
    expect(CiResultArtifact.parse(JSON.parse(readFileSync(result, 'utf8'))).findings_count).toBe(0);
    expect(posts).toHaveLength(0);
  });

  it('artifact is written even when the manifest is invalid', async () => {
    manifest({}, '{"name": ""}');
    const r = await runCi(deps(stubLlm([]).llm));
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('Invalid agent manifest');
    expect(existsSync(result)).toBe(true);
  });

  it('skills reach the prompt in manifest order', async () => {
    manifest({ skills: ['one', 'two'] });
    mkdirSync(path.join(ddir, 'skills'));
    writeFileSync(path.join(ddir, 'skills', 'one.md'), 'FIRST-RULE');
    writeFileSync(path.join(ddir, 'skills', 'two.md'), 'SECOND-RULE');
    const { llm, calls } = stubLlm([]);
    await runCi(deps(llm));
    expect(calls.system.indexOf('FIRST-RULE')).toBeGreaterThan(-1);
    expect(calls.system.indexOf('FIRST-RULE')).toBeLessThan(calls.system.indexOf('SECOND-RULE'));
  });

  it('unsupported provider exits 1 with a clear message, no secrets in logs/artifact', async () => {
    manifest({ provider: 'anthropic' });
    const logs: string[] = [];
    const r = await runCi(deps(stubLlm([]).llm, { makeLlm, log: (m) => logs.push(m) }));
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe('provider anthropic is not supported in CI (only openrouter)');
    expect(logs.join('\n') + readFileSync(result, 'utf8')).not.toContain('ghs_SECRET_TOKEN');
  });

  it('GitHub error message does not leak the token', async () => {
    manifest();
    const bad = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const r = await runCi(deps(stubLlm([]).llm, { fetchImpl: bad }));
    expect(r.exitCode).toBe(1);
    expect(r.error).not.toContain('ghs_SECRET_TOKEN');
  });

  it('retries a review body-only when inline comments are rejected (422)', async () => {
    manifest();
    let n = 0;
    const f = (async (url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(DIFF);
      n++;
      posts.push({ url, method: 'POST', body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: n === 1 ? 422 : 200 });
    }) as unknown as typeof fetch;
    const r = await runCi(deps(stubLlm([finding('WARNING')]).llm, { fetchImpl: f }));
    expect(r.exitCode).toBe(0);
    expect(posts).toHaveLength(2);
    expect((posts[1]!.body as { comments?: unknown }).comments).toBeUndefined();
  });
});

describe('manifest + skills loading (AC-B10)', () => {
  it('parses YAML with defaults', () => {
    manifest({}, 'name: Sec\nmodel: m\nsystem_prompt: hi\nskills:\n');
    expect(loadManifest(ddir)).toMatchObject({ provider: 'openrouter', skills: [], post_as: 'github_review', ci_fail_on: 'critical' });
  });
  it('rejects zero / multiple manifests', () => {
    mkdirSync(path.join(ddir, 'agents'), { recursive: true });
    expect(() => loadManifest(ddir)).toThrow(RunnerError);
    writeFileSync(path.join(ddir, 'agents', 'a.yaml'), 'name: a');
    writeFileSync(path.join(ddir, 'agents', 'b.yaml'), 'name: b');
    expect(() => loadManifest(ddir)).toThrow(/exactly one/);
  });
  it('rejects a path-like skill slug and a missing skill file', () => {
    expect(() => loadSkillBlocks(ddir, ['../x'])).toThrow(/Invalid skill slug/);
    expect(() => loadSkillBlocks(ddir, ['nope'])).toThrow(/not found/);
  });
});

describe('makeLlm', () => {
  it('openrouter without a key fails by name, never by value', () => {
    expect(() => makeLlm('openrouter', {})).toThrow('OPENROUTER_API_KEY is not set');
    expect(makeLlm('openrouter', { OPENROUTER_API_KEY: 'k' }).id).toBe('openrouter');
  });
});
