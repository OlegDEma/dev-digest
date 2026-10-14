import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/modules/repos/repository.js', () => ({
  RepoRepository: class {
    async getById() {
      return { id: 'r1', clonePath: '/clone' };
    }
  },
}));
vi.mock('../src/modules/project-context/repository.js', () => ({
  ProjectContextRepository: class {
    async attachedPathsByAgent() {
      return [];
    }
  },
}));

import { ProjectContextService } from '../src/modules/project-context/service.js';

describe('ProjectContextService.list (W5)', () => {
  it('yields to the event loop between documents instead of tokenising synchronously', async () => {
    const N = 40;
    const entries = Array.from({ length: N }, (_, i) => ({ path: `docs/${i}.md`, sizeBytes: 5, mtimeMs: 1 }));
    const container = {
      db: {},
      config: { projectContextBuckets: ['docs'] },
      cloneDocs: {
        discover: async () => entries,
        read: async () => ({ kind: 'ok', text: 'hello', sizeBytes: 5, mtimeMs: 1 }),
      },
      tokenizer: { count: (t: string) => t.length },
    };
    const svc = new ProjectContextService(container as never);

    let ticks = 0;
    let stop = false;
    const spin = () => {
      if (stop) return;
      ticks += 1;
      setImmediate(spin);
    };
    setImmediate(spin);
    const res = await svc.list('w1', 'r1');
    stop = true;

    expect(res.documents).toHaveLength(N);
    expect(res.documents[0]!.estimated_tokens).toBeGreaterThan(0);
    // another task got a turn between (nearly) every document
    expect(ticks).toBeGreaterThanOrEqual(N - 2);
  });
});
