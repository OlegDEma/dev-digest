import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdir, writeFile, symlink, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeClone, insertRepoAndPr } from './helpers/project-context.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { FsCloneDocs } from '../src/adapters/clone-docs/index.js';
import * as t from '../src/db/schema.js';
import type { CloneDocs } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (extra: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...extra } as NodeJS.ProcessEnv);

d('project-context API (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const appWith = (extra: Record<string, string> = {}, cloneDocs?: CloneDocs) =>
    buildApp({
      config: config(extra),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({}),
        ...(cloneDocs ? { cloneDocs } : {}),
      },
    });

  async function mkAgent(app: Awaited<ReturnType<typeof appWith>>, name = 'A') {
    const r = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
    });
    return r.json() as { id: string; version: number };
  }

  it('C1: exact set, buckets, statuses, path order (AC-1, AC-3, AC-4, AC-7)', async () => {
    const clone = await makeClone({
      'docs/b.md': 'bbbb',
      'docs/a.md': 'aaaa',
      'docs/specs/inner.md': 'x',
      'specs/s.md': 'spec',
      'packages/x/insights/i.md': 'ins',
      'src/readme.md': 'no',
      'node_modules/p/docs/z.md': 'no',
      'docs/vendor/v.md': 'no',
      'docs/notes.txt': 'no',
      'docs/big.md': 'x'.repeat(512 * 1024 + 1),
      'docs/bad.md': Buffer.from([0xff, 0xfe, 0xfd]),
    });
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ repo_id: repo.id, clone_available: true, truncated: false, total_found: 7 });
    expect(body.documents.map((x: { path: string }) => x.path)).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/bad.md',
      'docs/big.md',
      'docs/specs/inner.md',
      'packages/x/insights/i.md',
      'specs/s.md',
    ]);
    const by = Object.fromEntries(body.documents.map((x: { path: string }) => [x.path, x]));
    expect(by['docs/a.md']).toMatchObject({
      folder: 'docs',
      name: 'a.md',
      bucket: 'docs',
      size_bytes: 4,
      status: 'ok',
    });
    expect(typeof by['docs/a.md'].used_by_agents).toBe('number');
    expect(by['docs/a.md'].estimated_tokens).toBeGreaterThan(0);
    expect(by['docs/specs/inner.md'].bucket).toBe('docs');
    expect(by['packages/x/insights/i.md'].bucket).toBe('insights');
    expect(by['docs/big.md']).toMatchObject({ status: 'too_large', estimated_tokens: null });
    expect(by['docs/bad.md']).toMatchObject({ status: 'unreadable', estimated_tokens: null });
    await app.close();
  });

  it('AC-2: changing the configured bucket set changes discovery', async () => {
    const clone = await makeClone({ 'docs/a.md': 'a', 'adr/b.md': 'b' });
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const app = await appWith({ PROJECT_CONTEXT_BUCKETS: 'ADR' });
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.documents.map((x: { path: string }) => x.path)).toEqual(['adr/b.md']);
    await app.close();
  });

  it('AC-6: > 2000 docs -> first 2000, truncated, total_found', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 2001; i++) files[`docs/f${String(i).padStart(4, '0')}.md`] = 'x';
    const clone = await makeClone(files);
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const app = await appWith();
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.total_found).toBe(2001);
    expect(body.truncated).toBe(true);
    expect(body.documents).toHaveLength(2000);
    expect(body.documents[0].path).toBe('docs/f0000.md');
    await app.close();
  }, 60_000);

  it('AC-5: no clone -> 200 clone_available:false, empty; missing dir too; read/save 409', async () => {
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: null });
    const { repo: gone } = await insertRepoAndPr(pg.handle.db, workspaceId, {
      clonePath: join(tmpdir(), 'definitely-missing-clone-dir'),
    });
    const app = await appWith();
    for (const r of [repo, gone]) {
      const res = await app.inject({ method: 'GET', url: `/repos/${r.id}/context` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        repo_id: r.id,
        clone_available: false,
        total_found: 0,
        truncated: false,
        documents: [],
      });
    }
    const read = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/document?path=docs/a.md` });
    expect(read.statusCode).toBe(409);
    expect(read.json().error.code).toBe('repo_not_cloned');
    const save = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/document`,
      payload: { path: 'docs/a.md', text: 'x' },
    });
    expect(save.statusCode).toBe(409);
    expect(save.json().error.code).toBe('repo_not_cloned');
    const unknown = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-4000-8000-000000000000/context',
    });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });

  it('AC-11: used_by_agents counts distinct agents, direct + via bound skill, enabled ignored', async () => {
    const tag = `ub${Date.now()}`;
    const X = `docs/${tag}-x.md`;
    const Y = `docs/${tag}-y.md`;
    const clone = await makeClone({ [X]: 'x', [Y]: 'y' });
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const app = await appWith();
    const a1 = await mkAgent(app, 'UB-1');
    const a2 = await mkAgent(app, 'UB-2');
    await app.inject({ method: 'PUT', url: `/agents/${a1.id}`, payload: { enabled: false } });
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'ub-skill', description: 'd', type: 'rubric', body: 'b', enabled: false },
      })
    ).json();
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context-docs`, payload: { context_docs: [X] } });
    await app.inject({ method: 'POST', url: `/agents/${a2.id}/skills`, payload: { skill_id: skill.id } });
    await app.inject({ method: 'PUT', url: `/agents/${a1.id}/context-docs`, payload: { context_docs: [X, Y] } });
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const by = Object.fromEntries(body.documents.map((x: { path: string; used_by_agents: number }) => [x.path, x.used_by_agents]));
    expect(by[X]).toBe(2);
    expect(by[Y]).toBe(1);
    await app.close();
  });

  it('C2 read: text, tracked flag, traversal/symlink/limits refused (AC-38, AC-43, AC-7)', async () => {
    const clone = await makeClone({ 'docs/tracked.md': '# T', 'docs/untracked.md': '# U' });
    execSync('git init -q && git add docs/tracked.md', { cwd: clone });
    const outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
    await writeFile(join(outside, 'leak.md'), 'LEAK');
    await symlink(join(outside, 'leak.md'), join(clone, 'docs/link.md'));
    await writeFile(join(clone, 'docs/big.md'), 'x'.repeat(512 * 1024 + 1));
    await writeFile(join(clone, 'docs/bad.md'), Buffer.from([0xff, 0xfe]));
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const app = await appWith();
    const get = (p: string) =>
      app.inject({ method: 'GET', url: `/repos/${repo.id}/context/document?path=${encodeURIComponent(p)}` });

    const ok = await get('docs/tracked.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'docs/tracked.md', text: '# T', tracked: true, status: 'ok', bucket: 'docs' });
    expect((await get('docs/untracked.md')).json().tracked).toBe(false);

    for (const bad of ['../../etc/passwd', '/etc/passwd.md', 'docs/../../x.md', 'docs\\x.md', 'docs/x.txt']) {
      const r = await get(bad);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('invalid_path');
    }
    const sym = await get('docs/link.md');
    expect(sym.statusCode).toBe(404);
    expect(sym.json().error.code).toBe('document_not_found');
    expect((await get('docs/missing.md')).json().error.code).toBe('document_not_found');
    const big = await get('docs/big.md');
    expect(big.statusCode).toBe(413);
    expect(big.json().error.code).toBe('document_too_large');
    const bad = await get('docs/bad.md');
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('document_unreadable');
    await app.close();
  });

  it('C2 save: writes the file; 413 over 512 KB; refused paths; never creates; no git on list/save (AC-8, AC-42, AC-44)', async () => {
    const clone = await makeClone({ 'docs/a.md': 'old' });
    const outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
    await writeFile(join(outside, 'leak.md'), 'orig');
    await symlink(join(outside, 'leak.md'), join(clone, 'docs/link.md'));
    const { repo } = await insertRepoAndPr(pg.handle.db, workspaceId, { clonePath: clone });
    const fs = new FsCloneDocs();
    let tracked = 0;
    const spy: CloneDocs = {
      discover: (...a) => fs.discover(...a),
      read: (...a) => fs.read(...a),
      write: (...a) => fs.write(...a),
      isTracked: (...a) => {
        tracked += 1;
        return fs.isTracked(...a);
      },
    };
    const app = await appWith({}, spy);
    const put = (path: string, text: string) =>
      app.inject({ method: 'PUT', url: `/repos/${repo.id}/context/document`, payload: { path, text } });

    await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    const ok = await put('docs/a.md', 'brand new text');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'docs/a.md', status: 'ok', size_bytes: 14 });
    expect(ok.json().estimated_tokens).toBeGreaterThan(0);
    expect(ok.json()).not.toHaveProperty('tracked');
    expect(await readFile(join(clone, 'docs/a.md'), 'utf8')).toBe('brand new text');
    expect(tracked).toBe(0);
    await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/document?path=docs/a.md` });
    expect(tracked).toBe(1);

    const tooBig = await put('docs/a.md', 'x'.repeat(512 * 1024 + 1));
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().error.code).toBe('document_too_large');
    expect(await readFile(join(clone, 'docs/a.md'), 'utf8')).toBe('brand new text');

    const traversal = await put('../x.md', 'x');
    expect(traversal.statusCode).toBe(422);
    expect(traversal.json().error.code).toBe('invalid_path');
    const missing = await put('docs/new.md', 'x');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('document_not_found');
    const sym = await put('docs/link.md', 'pwn');
    expect(sym.statusCode).toBe(404);
    expect(await readFile(join(outside, 'leak.md'), 'utf8')).toBe('orig');
    await app.close();
  });

  it('C3: stored order, replace, rejects, 404 foreign workspace, version untouched (AC-13, AC-17, AC-19, NFR-9)', async () => {
    const app = await appWith();
    const agent = await mkAgent(app, 'C3-agent');
    const put = (url: string, docs: string[]) =>
      app.inject({ method: 'PUT', url, payload: { context_docs: docs } });

    const res = await put(`/agents/${agent.id}/context-docs`, ['docs/b.md', 'specs/a.md', 'insights/z.md']);
    expect(res.statusCode).toBe(200);
    expect(res.json().context_docs).toEqual(['docs/b.md', 'specs/a.md', 'insights/z.md']);
    const again = await app.inject({ method: 'GET', url: `/agents/${agent.id}` });
    expect(again.json().context_docs).toEqual(['docs/b.md', 'specs/a.md', 'insights/z.md']);
    // attach path unrelated to any repo (workspace-wide, AC-19) is simply stored
    expect(again.json().version).toBe(agent.version);
    const versions = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    // append is the client's job: whole-list replace
    expect((await put(`/agents/${agent.id}/context-docs`, ['docs/b.md'])).json().context_docs).toEqual(['docs/b.md']);

    const dup = await put(`/agents/${agent.id}/context-docs`, ['docs/a.md', 'docs/a.md']);
    expect(dup.statusCode).toBe(422);
    expect(dup.json().error.code).toBe('duplicate_path');
    const many = await put(
      `/agents/${agent.id}/context-docs`,
      Array.from({ length: 51 }, (_, i) => `docs/${i}.md`),
    );
    expect(many.statusCode).toBe(422);
    expect(many.json().error.code).toBe('attachment_limit');
    for (const bad of ['../x.md', '/abs.md', 'docs/x.txt']) {
      const r = await put(`/agents/${agent.id}/context-docs`, [bad]);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('invalid_path');
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().context_docs).toEqual(['docs/b.md']);

    // skills: same contract, version untouched
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'c3-skill', description: 'd', type: 'rubric', body: 'b' },
      })
    ).json();
    const s = await put(`/skills/${skill.id}/context-docs`, ['docs/s.md']);
    expect(s.statusCode).toBe(200);
    expect(s.json().context_docs).toEqual(['docs/s.md']);
    expect(s.json().version).toBe(skill.version);
    expect((await put(`/skills/${skill.id}/context-docs`, ['docs/s.md', 'docs/s.md'])).json().error.code).toBe('duplicate_path');

    // foreign workspace -> 404
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' } as never).returning();
    const [foreign] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'F', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const nf = await put(`/agents/${foreign!.id}/context-docs`, ['docs/a.md']);
    expect(nf.statusCode).toBe(404);
    const [foreignSkill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: otherWs!.id, name: 'FS', description: 'd', type: 'rubric', source: 'manual', body: 'b' })
      .returning();
    expect((await put(`/skills/${foreignSkill!.id}/context-docs`, ['docs/a.md'])).statusCode).toBe(404);
    const [row] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, foreign!.id));
    expect(row!.contextDocs).toEqual([]);
    await app.close();
  });
});
