import { describe, it, expect } from 'vitest';
import { shouldFail } from '../src/gate.js';

const f = (...s: string[]) => s.map((severity) => ({ severity }));

describe('shouldFail (AC-B11b)', () => {
  const table: [Parameters<typeof shouldFail>[1], string[], boolean][] = [
    ['never', ['CRITICAL', 'WARNING'], false],
    ['critical', ['WARNING', 'SUGGESTION'], false],
    ['critical', ['CRITICAL'], true],
    ['warning', ['SUGGESTION'], false],
    ['warning', ['WARNING'], true],
    ['warning', ['CRITICAL'], true],
    ['any', [], false],
    ['any', ['SUGGESTION'], true],
  ];
  it.each(table)('ci_fail_on=%s findings=%j -> %s', (failOn, sev, expected) => {
    expect(shouldFail(f(...sev), failOn)).toBe(expected);
  });
});
