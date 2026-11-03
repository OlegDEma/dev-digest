import { AgentManifest } from '@devdigest/shared';
import type {
  CiFile,
  CiPostAs,
  CiInstallation,
  CiRun,
  Provider,
  ReviewStrategy,
  CiFailOn,
} from '@devdigest/shared';
import { slugify } from '../_shared/slug.js';
import { WORKFLOW_PATH, ARTIFACT_NAME, RESULT_FILE } from './constants.js';

export interface ManifestAgent {
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
}

export interface ManifestSkill {
  name: string;
  body: string;
}

/** The Actions-secret variable the runner reads the provider key from. */
export function providerKeyVar(provider: Provider): string {
  switch (provider) {
    case 'openrouter':
      return 'OPENROUTER_API_KEY';
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
  }
}

/** Unique, stable file slugs for the skills (names may collide after slugify). */
export function skillSlugs(skills: ManifestSkill[]): string[] {
  const taken = new Set<string>();
  return skills.map((s) => {
    const base = slugify(s.name);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    taken.add(slug);
    return slug;
  });
}

export function agentSlug(name: string): string {
  return slugify(name);
}

/** Build and validate the manifest the runner will read (same schema both ends). */
export function buildManifest(
  agent: ManifestAgent,
  skills: ManifestSkill[],
  postAs: CiPostAs,
): AgentManifest {
  return AgentManifest.parse({
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs(skills),
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    post_as: postAs,
  });
}

/** JSON text — valid YAML 1.2, so no YAML dependency is needed here. */
export function buildManifestFile(manifest: AgentManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function manifestPath(slug: string): string {
  return `.devdigest/agents/${slug}.yaml`;
}

export function skillFile(slug: string, skill: ManifestSkill): CiFile {
  const body = skill.body.endsWith('\n') ? skill.body : `${skill.body}\n`;
  return { path: `.devdigest/skills/${slug}.md`, contents: body, editable: false };
}

/**
 * The GitHub Actions workflow. Interpolations are JSON-quoted (valid YAML
 * double-quoted scalars) and only `${{ secrets.X }}` references are written —
 * never a key value.
 */
export function buildWorkflowYaml(opts: {
  runnerRef: string;
  triggers: string[];
  keyVar: string;
  agentSlug: string;
}): string {
  const q = (s: string) => JSON.stringify(s);
  return `name: ${q(`DevDigest Review (${opts.agentSlug})`)}
on:
  pull_request:
    types: [${opts.triggers.map(q).join(', ')}]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    if: \${{ github.event.pull_request.head.repo.fork == false }}
    steps:
      # Policy (.devdigest/) is read from the BASE commit, so a PR cannot change its own gate.
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - name: DevDigest review
        uses: ${q(opts.runnerRef)}
        env:
          ${opts.keyVar}: \${{ secrets.${opts.keyVar} }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - name: Upload result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ${ARTIFACT_NAME}
          path: ${RESULT_FILE}
          if-no-files-found: warn
`;
}

export function workflowFile(contents: string): CiFile {
  return { path: WORKFLOW_PATH, contents, editable: false };
}

/** Status of an ingested run: a failed GitHub run wins, else by findings. */
export function ciRunStatus(
  conclusion: string | null,
  findingsCount: number,
): 'failed' | 'no_findings' | 'succeeded' {
  if (conclusion === 'failure') return 'failed';
  return findingsCount === 0 ? 'no_findings' : 'succeeded';
}

export function toCiInstallationDto(row: {
  id: string;
  agentId: string;
  repo: string;
  targetType: CiInstallation['target_type'];
  installedAt: Date;
}): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
  };
}

export function toCiRunDto(
  run: {
    id: string;
    ciInstallationId: string | null;
    prNumber: number | null;
    ranAt: Date | null;
    status: string | null;
    findingsCount: number | null;
    costUsd: number | null;
    githubUrl: string | null;
    source: string | null;
    agent: string | null;
    durationMs: number | null;
  },
  agentName: string | null,
): CiRun {
  return {
    id: run.id,
    ci_installation_id: run.ciInstallationId,
    pr_number: run.prNumber,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    status: run.status,
    findings_count: run.findingsCount,
    cost_usd: run.costUsd,
    github_url: run.githubUrl,
    source: run.source,
    agent: run.agent ?? agentName,
    duration_s: run.durationMs == null ? null : run.durationMs / 1000,
  };
}
