import { writeFileSync } from 'node:fs';
import { CiResultArtifact } from '@devdigest/shared';

export interface ArtifactInput {
  findings: { severity: string }[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  version?: string | null;
  prNumber?: number | null;
}

/** Build the validated `CiResultArtifact` (throws if it would not validate). */
export function buildArtifact(i: ArtifactInput): CiResultArtifact {
  const count = (sev: string) => i.findings.filter((f) => f.severity === sev).length;
  return CiResultArtifact.parse({
    findings_count: i.findings.length,
    critical: count('CRITICAL'),
    warning: count('WARNING'),
    suggestion: count('SUGGESTION'),
    cost_usd: i.costUsd,
    duration_ms: Math.round(i.durationMs),
    agent: i.agent,
    version: i.version ?? null,
    pr_number: i.prNumber ?? null,
  });
}

export function writeArtifact(file: string, artifact: CiResultArtifact): void {
  writeFileSync(file, JSON.stringify(artifact, null, 2));
}
