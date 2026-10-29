import type { CiFailOn } from '@devdigest/shared';

const RANK: Record<string, number> = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
const MIN_RANK: Record<CiFailOn, number> = { never: Infinity, critical: 3, warning: 2, any: 1 };

/** Should the CI check fail for these findings under the manifest's `ci_fail_on`? */
export function shouldFail(findings: { severity: string }[], failOn: CiFailOn): boolean {
  const min = MIN_RANK[failOn];
  return findings.some((f) => (RANK[f.severity] ?? 0) >= min);
}
