import { describe, it, expect } from 'vitest';
import { taskLine, currentReviewFindings } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('currentReviewFindings', () => {
  const rev = (id: string, agentId: string | null, at: string, kind = 'review') =>
    ({ id, agentId, kind, createdAt: new Date(at) }) as never;
  const fnd = (id: string, dismissedAt: Date | null = null) => ({ id, dismissedAt }) as never;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  it('ignores an older review of the same agent even when passed first', () => {
    const out = currentReviewFindings([
      { review: rev('r1', 'a', '2026-01-01'), findings: [fnd('old')] },
      { review: rev('r2', 'a', '2026-02-01'), findings: [fnd('new')] },
    ]);
    expect(ids(out)).toEqual(['new']);
  });

  it('collapses null-agent reviews into one bucket (newest wins)', () => {
    const out = currentReviewFindings([
      { review: rev('r1', null, '2026-02-01'), findings: [fnd('new')] },
      { review: rev('r2', null, '2026-01-01'), findings: [fnd('old')] },
    ]);
    expect(ids(out)).toEqual(['new']);
  });

  it('ignores summary reviews and dismissed findings; agents are additive', () => {
    const out = currentReviewFindings([
      { review: rev('s', 'a', '2026-03-01', 'summary'), findings: [fnd('sum')] },
      { review: rev('r1', 'a', '2026-01-01'), findings: [fnd('a1'), fnd('gone', new Date())] },
      { review: rev('r2', 'b', '2026-01-01'), findings: [fnd('b1'), fnd('a1')] },
    ]);
    expect(ids(out)).toEqual(['a1', 'b1']);
  });
});
