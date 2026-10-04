import { describe, it, expect } from 'vitest';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import { NotFoundError } from '../src/platform/errors.js';

const container = {
  db: {},
  llm: () => {
    throw new Error('no LLM');
  },
  github: () => {
    throw new Error('no GitHub');
  },
};

const review = (id: string, at: string) =>
  ({ id, agentId: 'a1', kind: 'review', createdAt: new Date(at) }) as never;
const finding = (id: string, startLine: number) =>
  ({ id, file: 'src/a.ts', startLine, dismissedAt: null }) as never;

function make(opts: { pull?: unknown; reviews?: unknown[] }) {
  const calls = { getPull: [] as unknown[][], getPrFiles: 0, reviewsForPull: 0 };
  const repo = {
    getPull: async (...args: unknown[]) => {
      calls.getPull.push(args);
      return 'pull' in opts ? opts.pull : { id: 'p1' };
    },
    getPrFiles: async () => {
      calls.getPrFiles++;
      return [
      { path: 'src/a.ts', additions: 2, deletions: 1 },
      { path: 'README.md', additions: 1, deletions: 0 },
      ];
    },
    reviewsForPull: async () => {
      calls.reviewsForPull++;
      return opts.reviews ?? [];
    },
  };
  return { service: new SmartDiffService(container as never, repo as never), calls };
}

describe('SmartDiffService.get', () => {
  it('returns grouped files with empty finding_lines when there are no reviews', async () => {
    const out = await make({}).service.get('ws', 'p1');
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(out.groups.map((g) => g.files.length)).toEqual([1, 0, 0, 1, 0]);
    expect(out.groups.every((g) => g.files.every((f) => f.finding_lines.length === 0))).toBe(true);
  });

  it('throws NotFoundError for a missing PR', async () => {
    const { service, calls } = make({ pull: undefined });
    await expect(service.get('ws', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(calls.getPull).toEqual([['ws', 'p1']]);
    expect(calls.getPrFiles).toBe(0);
    expect(calls.reviewsForPull).toBe(0);
  });

  it('uses only the newest review of an agent (selector wired in)', async () => {
    const out = await make({
      reviews: [
        { review: review('r-old', '2026-01-01'), findings: [finding('f1', 5)] },
        { review: review('r-new', '2026-02-01'), findings: [finding('f2', 9)] },
      ],
    }).service.get('ws', 'p1');
    expect(out.groups[0]!.files[0]!.finding_lines).toEqual([9]);
  });
});
