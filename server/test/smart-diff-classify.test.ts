import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyPath } from '../src/modules/smart-diff/classify.js';
import { ROLE_ORDER } from '../src/modules/smart-diff/constants.js';

const rows: [string, string][] = [
  ['__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['.claude/skills/security/SKILL.md', 'wiring'],
  ['e2e/README.md', 'tests'],
  ['server/dist/x.js', 'boilerplate'],
  ['client/build/static/a.js', 'boilerplate'],
  ['pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['x/Cargo.lock', 'boilerplate'],
  ['dist/a.js', 'boilerplate'],
  ['a.min.js', 'boilerplate'],
  ['a.generated.ts', 'boilerplate'],
  ['src/a.test.tsx', 'tests'],
  ['src/a.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['server/test/x.ts', 'tests'],
  ['a/__tests__/b.ts', 'tests'],
  ['src/index.ts', 'wiring'],
  ['vite.config.ts', 'wiring'],
  ['tsconfig.base.json', 'wiring'],
  ['.eslintrc.json', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.dev.yml', 'wiring'],
  ['.github/workflows/x.yml', 'wiring'],
  ['docs/x.txt', 'docs'],
  ['server/README.md', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['LICENSE', 'docs'],
  ['src/app.ts', 'core'],
  ['README.MD', 'docs'],
  ['src/distance.ts', 'core'],
  ['./src/app.ts', 'core'],
  ['server\\dist\\x.js', 'boilerplate'],
];

describe('classifyPath', () => {
  it.each(rows)('%s → %s', (path, role) => {
    expect(classifyPath(path)).toBe(role);
  });
});

describe('ROLE_ORDER', () => {
  it('has the same members, in the same order, as the SmartDiffRole contract', () => {
    expect([...ROLE_ORDER]).toEqual([...SmartDiffRole.options]);
  });
});
