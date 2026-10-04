import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Reviewer reading order: substance first, noise last. An explicit literal that
 * mirrors the `SmartDiffRole` declaration order; `satisfies` + `RoleOrderCovers`
 * make tsc fail if the enum grows and this list does not.
 */
export const ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const satisfies readonly SmartDiffRole[];
type RoleOrderCovers = Exclude<SmartDiffRole, (typeof ROLE_ORDER)[number]> extends never ? true : false;
const roleOrderCovers: RoleOrderCovers = true;
void roleOrderCovers;

/**
 * Path classification rules, FIRST MATCH WINS. `core` has no rule: it is the
 * fallback. Paths are normalised to `/` with no leading `./` before testing.
 * `dist/`, `build/`, `test/`… match as a path SEGMENT at any depth; `e2e/`,
 * `docs/`, `.github/`, `.claude/` are root-anchored. Case-sensitive.
 */
export const CLASSIFY_RULES: readonly { role: SmartDiffRole; patterns: readonly RegExp[] }[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(^|\/)[^/]*\.lock$/, // *.lock
      /(^|\/)pnpm-lock\.yaml$/, // pnpm-lock.yaml
      /(^|\/)package-lock\.json$/, // package-lock.json
      /(^|\/)yarn\.lock$/, // yarn.lock
      /(^|\/)dist\//, // dist/ (any depth)
      /(^|\/)build\//, // build/ (any depth)
      /(^|\/)__snapshots__\//, // __snapshots__/
      /\.snap$/, // *.snap
      /(^|\/)[^/]*\.generated\.[^/]*$/, // *.generated.*
      /\.min\.js$/, // *.min.js
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/, // *.test.ts, *.test.tsx, *.it.test.ts
      /\.spec\.ts$/, // *.spec.ts
      /(^|\/)test\//, // test/
      /(^|\/)tests\//, // tests/
      /(^|\/)__tests__\//, // __tests__/
      /^e2e\//, // e2e/** (root)
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/, // index.ts, index.js
      /(^|\/)[^/]*\.config\.[^/]*$/, // *.config.*
      /(^|\/)tsconfig[^/]*\.json$/, // tsconfig*.json
      /(^|\/)\.eslintrc[^/]*$/, // .eslintrc*
      /(^|\/)\.env[^/]*$/, // .env*
      /(^|\/)docker-compose[^/]*\.ya?ml$/, // docker-compose*.yml
      /^\.github\//, // .github/** (root)
      /^\.claude\//, // .claude/** (root)
    ],
  },
  {
    role: 'docs',
    patterns: [
      /\.md$/, // *.md
      /^docs\//, // docs/** (root)
      /(^|\/)README[^/]*$/, // README*
      /(^|\/)CHANGELOG[^/]*$/, // CHANGELOG*
      /(^|\/)LICENSE$/, // LICENSE
    ],
  },
];
