import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

/** Role of a changed file: first matching rule in CLASSIFY_RULES, else `core`. */
export function classifyPath(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of CLASSIFY_RULES) {
    if (rule.patterns.some((re) => re.test(p))) return rule.role;
  }
  return 'core';
}
