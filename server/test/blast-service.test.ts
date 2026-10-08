import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { BlastService } from '../src/modules/blast/service.js';
import { NotFoundError } from '../src/platform/errors.js';

const pull = { id: 'pr1', repoId: 'r1', base: 'main', headSha: 'head1' };

function setup(opts: {
  prFiles?: string[];
  state?: Record<string, unknown> | null;
  pull?: unknown;
  diffFiles?: string[];
}) {
  const symbolsSpy = vi.fn(async () => []);
  const referencesSpy = vi.fn(async () => []);
  const llm = vi.fn();
  const githubSpy = vi.fn(async () => {
    throw new Error('blast must not call GitHub');
  });
  const diff = vi.fn(async () => ({ files: (opts.diffFiles ?? []).map((path) => ({ path })) }));
  const container = {
    db: {},
    config: { repoIntelEnabled: true },
    codeIndex: { symbols: symbolsSpy, references: referencesSpy },
    llm,
    git: { diff },
    github: githubSpy,
  } as never;
  const intel = new RepoIntelService(container);
  (intel as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => (opts.state === null ? null : { repoId: 'r1', lastIndexedSha: 'idx', ...opts.state }),
    getSymbolRows: async (_r: string, paths: string[]) =>
      paths.includes('decl.ts')
        ? [{ path: 'decl.ts', name: 'a', kind: 'function', line: 1, endLine: 2, exported: true, signature: null }]
        : [{ path: 'c.ts', name: 'caller', kind: 'function', line: 1, endLine: 9, exported: true, signature: null }],
    getResolvedCallers: async () => [{ fromPath: 'c.ts', toSymbol: 'a', line: 3, rank: 1 }],
    getFileFacts: async () => [{ filePath: 'c.ts', endpoints: ['GET /x'], crons: [] }],
    getRepoBasics: async () => null,
  };
  const spy = vi.spyOn(intel, 'getBlastRadius');
  (container as unknown as Record<string, unknown>).repoIntel = intel;
  const reviews = {
    getPull: async () => (opts.pull === undefined ? pull : opts.pull),
    getPrFiles: async () => (opts.prFiles ?? ['decl.ts']).map((path) => ({ path })),
    getRepo: async () => ({ owner: 'acme', name: 'w' }),
  };
  const logs: { obj: Record<string, unknown>; msg?: string }[] = [];
  const log = {
    info: (obj: unknown, msg?: string) => void logs.push({ obj: obj as Record<string, unknown>, msg }),
    warn: () => {},
  };
  const service = new BlastService(container, reviews as never);
  return { service, githubSpy, symbolsSpy, referencesSpy, llm, diff, spy, logs, log };
}

describe('BlastService.get (hermetic, real RepoIntelService)', () => {
  it('degraded index: no codeIndex, facade asked index-only', async () => {
    const t = setup({ state: { status: 'failed', degraded: true, degradedReason: 'index_failed' } });
    const res = await t.service.get('ws', 'pr1', t.log);
    expect(res).toMatchObject({ degraded: true, reason: 'index_failed' });
    expect(t.symbolsSpy).not.toHaveBeenCalled();
    expect(t.referencesSpy).not.toHaveBeenCalled();
    expect(t.spy).toHaveBeenCalledWith('r1', ['decl.ts'], { fallback: false });
  });

  it('usable index: one blast.read log line, no LLM', async () => {
    const t = setup({ state: { status: 'full' } });
    const res = await t.service.get('ws', 'pr1', t.log);
    expect(res.degraded).toBe(false);
    expect(res.downstream[0]!.callers).toHaveLength(1);
    expect(res.index_sha).toBe('idx');
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]!.msg).toBe('blast.read');
    expect(t.logs[0]!.obj).toMatchObject({ source: 'repo_intel_index', changed_files_source: 'pr_files' });
    expect(t.llm).not.toHaveBeenCalled();
    expect(t.githubSpy).not.toHaveBeenCalled();
  });

  it('empty pr_files -> git diff fallback', async () => {
    const t = setup({ prFiles: [], diffFiles: ['decl.ts'], state: { status: 'full' } });
    await t.service.get('ws', 'pr1', t.log);
    expect(t.diff).toHaveBeenCalledWith({ owner: 'acme', name: 'w' }, 'main', 'head1');
    expect(t.logs[0]!.obj).toMatchObject({ changed_files_source: 'git_diff', changed_files: 1 });
  });

  it('unknown PR -> NotFoundError', async () => {
    const t = setup({ pull: undefined as never });
    const svc = new BlastService({} as never, { getPull: async () => undefined } as never);
    await expect(svc.get('ws', 'nope', t.log)).rejects.toBeInstanceOf(NotFoundError);
  });
});
