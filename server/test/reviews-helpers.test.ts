import { describe, it, expect } from 'vitest';
import { reviewToRecord, taskLine } from '../src/modules/reviews/helpers.js';

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

describe('reviewToRecord', () => {
  const base = {
    id: 'r1',
    prId: 'p1',
    agentId: null,
    runId: 'run1',
    kind: 'review',
    verdict: 'approve',
    summary: 's',
    score: 90,
    model: 'm',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as never;
  const finding = {
    id: 'f1',
    reviewId: 'r1',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    startLine: 3,
    endLine: 4,
    rationale: 'r',
    suggestion: null,
    confidence: 0.5,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
  } as never;

  it("keeps a valid lowercase verdict", () => {
    expect(reviewToRecord(base, [], 'A').verdict).toBe('approve');
  });

  it("maps an unknown / wrong-case verdict ('APPROVE') to null, not a throw", () => {
    expect(reviewToRecord({ ...(base as object), verdict: 'APPROVE' } as never, []).verdict).toBeNull();
  });

  it('keeps a null verdict null', () => {
    expect(reviewToRecord({ ...(base as object), verdict: null } as never, []).verdict).toBeNull();
  });

  it('emits snake_case findings and the agent name', () => {
    const rec = reviewToRecord(base, [finding], 'Bot');
    expect(rec.agent_name).toBe('Bot');
    expect(rec.findings[0]).toMatchObject({ start_line: 3, end_line: 4, review_id: 'r1' });
  });
});
