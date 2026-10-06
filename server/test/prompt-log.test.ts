import { describe, it, expect, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import fs from 'node:fs';
import Fastify from 'fastify';
import {
  buildPromptRecord,
  emitPromptAssembled,
  fingerprint,
  type PromptLogCall,
} from '../src/platform/prompt-log.js';
import { buildApp } from '../src/app.js';
import { loadConfig, resolvePromptLog } from '../src/platform/config.js';
import { LOG_REDACT } from '../src/platform/log-redact.js';

const tokenizer = { count: (t: string) => Math.ceil(t.length / 4) };

const call: PromptLogCall = {
  feature: 'review',
  provider: 'openrouter',
  model: 'm',
  runId: 'run-1',
  prId: 'pr-1',
  agent: 'sec',
  sessionId: 'SENTINEL-OWNER/SENTINEL-REPO#7:agent',
  chunk: { index: 0, count: 1, path: 'src/a.ts' },
  sections: [
    { name: 'system', text: 'sys key sk-or-v1-FAKEKEY' },
    { name: 'skills', text: '### my-skill\nSKILL-BODY-SENTINEL', items: 1, itemNames: ['my-skill'] },
    { name: 'specs', text: 'SPEC-BODY-SENTINEL', items: 1 },
    { name: 'diff', text: '+added-SECRET-line' },
    { name: 'weird', text: 'x' },
  ],
};
const BODY_SENTINELS = ['sk-or-v1-FAKEKEY', '+added-SECRET-line', 'SPEC-BODY-SENTINEL', 'SKILL-BODY-SENTINEL'];

describe('buildPromptRecord', () => {
  it.each(['summary', 'verbose'] as const)('is content-free (%s)', (mode) => {
    const json = JSON.stringify(buildPromptRecord(call, mode, tokenizer, 'cid'));
    for (const s of BODY_SENTINELS) expect(json).not.toContain(s);
    if (mode === 'summary') {
      expect(json).not.toContain('session_id');
      expect(json).not.toContain('SENTINEL-OWNER');
      expect(json).not.toContain('SENTINEL-REPO');
    }
  });

  it('maps unknown section names to other', () => {
    const r = buildPromptRecord(call, 'summary', tokenizer, 'cid');
    const other = r.sections.find((s) => s.origin === 'other')!;
    expect(other.name).toBe('other');
    expect(r.sections.map((s) => s.name)).toEqual(['system', 'skills', 'specs', 'diff', 'other']);
    expect(r.totals.sections).toBe(5);
  });

  it('verbose adds session_id, fingerprint, item_names, chunk.path; summary none', () => {
    const v = buildPromptRecord(call, 'verbose', tokenizer, 'cid');
    expect(v.session_id).toBe('SENTINEL-OWNER/SENTINEL-REPO#7:agent');
    expect(v.chunk?.path).toBe('src/a.ts');
    expect(v.sections.every((s) => /^[0-9a-f]{8}$/.test(s.fingerprint!))).toBe(true);
    expect(v.sections.find((s) => s.name === 'skills')!.item_names).toEqual(['my-skill']);

    const s = buildPromptRecord(call, 'summary', tokenizer, 'cid');
    expect(s.chunk).toEqual({ index: 0, count: 1 });
    expect(s.sections.some((x) => 'fingerprint' in x || 'item_names' in x)).toBe(false);
    expect(s.run_id).toBe('run-1');
  });

  it('caps item_names at 50 x 200 chars', () => {
    const r = buildPromptRecord(
      { ...call, sections: [{ name: 'skills', text: 't', itemNames: Array.from({ length: 80 }, () => 'n'.repeat(500)) }] },
      'verbose',
      tokenizer,
      'cid',
    );
    const names = r.sections[0]!.item_names!;
    expect(names).toHaveLength(50);
    expect(names[0]).toHaveLength(200);
  });
});

describe('fingerprint (HMAC, per-process key)', () => {
  it('is stable in-process, key-dependent, and not a plain sha256', () => {
    expect(fingerprint('x')).toBe(fingerprint('x'));
    expect(fingerprint('x', randomBytes(32))).not.toBe(fingerprint('x'));
    expect(fingerprint('x')).not.toBe(createHash('sha256').update('x').digest('hex').slice(0, 8));
  });
});

describe('emitPromptAssembled', () => {
  it('logs one info line and returns the call id', () => {
    const info = vi.fn();
    const id = emitPromptAssembled({ info, warn: vi.fn() }, 'summary', tokenizer, call);
    expect(id).toBeTruthy();
    expect(info).toHaveBeenCalledTimes(1);
    expect((info.mock.calls[0]![0] as { call_id: string }).call_id).toBe(id);
  });

  it('never throws when the logger throws', () => {
    const logger = { info: () => { throw new Error('io'); }, warn: () => { throw new Error('io'); } };
    expect(emitPromptAssembled(logger, 'summary', tokenizer, call)).toBeNull();
  });

  it('mode off / no logger makes no call', () => {
    const info = vi.fn();
    expect(emitPromptAssembled({ info, warn: vi.fn() }, 'off', tokenizer, call)).toBeNull();
    expect(emitPromptAssembled(undefined, 'summary', tokenizer, call)).toBeNull();
    expect(info).not.toHaveBeenCalled();
  });
});

describe('PROMPT_LOG config', () => {
  it('resolvePromptLog matrix', () => {
    expect(resolvePromptLog(undefined, 'development', undefined).effective).toBe('summary');
    expect(resolvePromptLog('off', 'development', undefined).effective).toBe('off');
    expect(resolvePromptLog('verbose', 'development', undefined)).toMatchObject({ effective: 'verbose', downgradeReason: null });
    for (const env of ['production', 'test'] as const) {
      const r = resolvePromptLog('verbose', env, undefined);
      expect(r.effective).toBe('summary');
      expect(r.downgradeReason).toContain('PROMPT_LOG=verbose ignored');
    }
    expect(resolvePromptLog('verbose', 'development', 'true').effective).toBe('summary');
  });

  it('loadConfig: empty = summary, invalid throws', () => {
    expect(loadConfig({ PROMPT_LOG: '' }).promptLog.effective).toBe('summary');
    expect(() => loadConfig({ PROMPT_LOG: 'loud' })).toThrow();
  });
});

describe('pino redact (LOG_REDACT) via app.inject', () => {
  it('censors secrets in logged objects and error shapes', async () => {
    let out = '';
    const stream = new Writable({
      write(chunk, _e, cb) {
        out += chunk.toString();
        cb();
      },
    });
    const app = Fastify({ logger: { level: 'info', stream, redact: LOG_REDACT } });
    app.get('/t', async (req) => {
      req.log.info({ apiKey: 'K1', nested: { token: 'T1' } });
      req.log.info({ authorization: 'Bearer TOP', password: 'PW1', secret: 'SEC1' });
      throw Object.assign(new Error('boom'), {
        details: { raw: 'RAW-SECRET' },
        config: { headers: { Authorization: 'Bearer CFG' } },
        request: { headers: { authorization: 'Bearer REQ' } },
        response: { config: { headers: { Authorization: 'Bearer RESP' } } },
      });
    });
    app.setErrorHandler((err, req, reply) => {
      req.log.error({ err }, 'boom');
      reply.code(500).send({ ok: false });
    });
    await app.inject({ url: '/t', headers: { authorization: 'Bearer HDR' } });
    await app.close();
    for (const s of ['K1', 'T1', 'RAW-SECRET', 'Bearer CFG', 'Bearer REQ', 'Bearer RESP', 'Bearer HDR', 'Bearer TOP', 'PW1', 'SEC1']) {
      expect(out).not.toContain(s);
    }
    expect(out).toContain('[redacted]');
  });
});

describe('buildApp boot warn for a downgraded PROMPT_LOG (AC-5)', () => {
  it('logs exactly one prompt_log.downgraded warn with the reason', async () => {
    const lines: string[] = [];
    const asyncSpy = vi.spyOn(fs, 'write').mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => {
      if (fd === 1) lines.push(String(data));
      const cb = rest.find((r) => typeof r === 'function') as ((e: null, n: number) => void) | undefined;
      cb?.(null, String(data).length);
    }) as never);
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, data: unknown) => {
      if (fd === 1) lines.push(String(data));
      return String(data).length;
    }) as never);
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      const config = {
        ...loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'warn', PROMPT_LOG: 'verbose' } as NodeJS.ProcessEnv),
        secretsPath: '/nonexistent/secrets.json',
      };
      expect(config.promptLog.downgradeReason).toBeTruthy();
      app = await buildApp({ config, db: {} as never });
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      spy.mockRestore();
      asyncSpy.mockRestore();
      await app?.close();
    }
    const warns = lines
      .flatMap((l) => l.split('\n'))
      .filter((l) => l.includes('prompt_log.downgraded'));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('PROMPT_LOG=verbose ignored');
  });
});
