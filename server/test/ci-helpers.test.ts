import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { AgentManifest, CiResultArtifact } from '@devdigest/shared';
import {
  buildManifest,
  buildManifestFile,
  buildWorkflowYaml,
  ciRunStatus,
  providerKeyVar,
  skillFile,
  skillSlugs,
  toCiRunDto,
} from '../src/modules/ci/helpers.js';
import { parseResultZip } from '../src/modules/ci/service.js';
import { loadConfig } from '../src/platform/config.js';
import { ArtifactExpiredError, isArtifactExpiredError } from '@devdigest/shared';

const agent = {
  name: 'Security Reviewer',
  provider: 'openrouter' as const,
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'Review the diff for bugs.',
  strategy: 'map-reduce' as const,
  ciFailOn: 'warning' as const,
};

const SECRET = 'sk-or-v1-supersecretvalue';

describe('providerKeyVar', () => {
  it('maps each provider to its Actions secret name', () => {
    expect(providerKeyVar('openrouter')).toBe('OPENROUTER_API_KEY');
    expect(providerKeyVar('openai')).toBe('OPENAI_API_KEY');
    expect(providerKeyVar('anthropic')).toBe('ANTHROPIC_API_KEY');
  });
});

describe('buildManifest / buildManifestFile (AC-B5)', () => {
  it.each(['github_review', 'pr_comment', 'none'] as const)(
    'round-trips through JSON.parse + AgentManifest.parse with post_as=%s',
    (postAs) => {
      const skills = [
        { name: 'SQL Rules', body: 'b1' },
        { name: 'sql rules', body: 'b2' },
      ];
      const manifest = buildManifest(agent, skills, postAs);
      const parsed = AgentManifest.parse(JSON.parse(buildManifestFile(manifest)));
      expect(parsed.post_as).toBe(postAs);
      expect(parsed.skills).toEqual(['sql-rules', 'sql-rules-2']);
      expect(parsed).toMatchObject({
        name: 'Security Reviewer',
        provider: 'openrouter',
        strategy: 'map-reduce',
        ci_fail_on: 'warning',
        system_prompt: 'Review the diff for bugs.',
      });
    },
  );

  it('skillSlugs are unique and skillFile lives under .devdigest/skills', () => {
    const slugs = skillSlugs([{ name: 'A', body: '' }, { name: 'a', body: '' }]);
    expect(slugs).toEqual(['a', 'a-2']);
    const f = skillFile('a', { name: 'A', body: 'text' });
    expect(f.path).toBe('.devdigest/skills/a.md');
    expect(f.contents).toBe('text\n');
  });
});

describe('buildWorkflowYaml (AC-B5, AC-B6a, AC-B12)', () => {
  const yaml = buildWorkflowYaml({
    runnerRef: 'acme/dev-digest/agent-runner@v1',
    triggers: ['opened', 'synchronize'],
    keyVar: 'OPENROUTER_API_KEY',
    agentSlug: 'security-reviewer',
  });

  it('uses the configured runner reference and the selected triggers', () => {
    expect(yaml).toContain('uses: "acme/dev-digest/agent-runner@v1"');
    expect(yaml).toContain('types: ["opened", "synchronize"]');
  });

  it('uploads devdigest-result on every run and skips forks', () => {
    expect(yaml).toMatch(/if: always\(\)\n\s+uses: actions\/upload-artifact@v4/);
    expect(yaml).toContain('name: devdigest-result');
    expect(yaml).toContain('github.event.pull_request.head.repo.fork == false');
    expect(yaml).toContain('pull-requests: write');
  });

  it('checks out the repo before the runner and uploads exactly devdigest-result.json', () => {
    expect(yaml.indexOf('actions/checkout@v4')).toBeGreaterThan(-1);
    expect(yaml.indexOf('actions/checkout@v4')).toBeLessThan(yaml.indexOf('agent-runner@v1'));
    expect(yaml).toContain('path: devdigest-result.json');
    expect(yaml).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(yaml).toContain('persist-credentials: false');
    expect(yaml).not.toMatch(/head\.sha|head\.ref|refs\/pull|merge/);
    expect(yaml).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('carries secret references only, never a key value', () => {
    expect(yaml).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(yaml).not.toContain(SECRET);
    expect(yaml).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it('quotes interpolations so a hostile ref cannot inject YAML', () => {
    const evil = buildWorkflowYaml({
      runnerRef: 'x"\n  run: curl evil',
      triggers: ['opened'],
      keyVar: 'OPENAI_API_KEY',
      agentSlug: 's',
    });
    expect(evil).toContain('uses: "x\\"\\n  run: curl evil"');
    expect(evil).not.toMatch(/^\s+run: curl evil/m);
  });
});

describe('DEVDIGEST_RUNNER_REF config (F1)', () => {
  it('defaults to the DevDigest agent-runner reference and is overridable', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).runnerRef).toBe(
      'OlegDEma/dev-digest/agent-runner@<tag>',
    );
    expect(
      loadConfig({ NODE_ENV: 'test', DEVDIGEST_RUNNER_REF: 'me/x/agent-runner@v2' } as NodeJS.ProcessEnv)
        .runnerRef,
    ).toBe('me/x/agent-runner@v2');
    expect(
      loadConfig({ NODE_ENV: 'test', DEVDIGEST_RUNNER_REF: '' } as NodeJS.ProcessEnv).runnerRef,
    ).toBe('OlegDEma/dev-digest/agent-runner@<tag>');
  });
});

describe('ciRunStatus (D16)', () => {
  it('failure wins; else no_findings when 0; else succeeded', () => {
    expect(ciRunStatus('failure', 3)).toBe('failed');
    expect(ciRunStatus('failure', 0)).toBe('failed');
    expect(ciRunStatus('success', 0)).toBe('no_findings');
    expect(ciRunStatus('success', 2)).toBe('succeeded');
  });
});

describe('toCiRunDto', () => {
  it('maps camelCase to snake_case and derives duration_s', () => {
    const dto = toCiRunDto(
      {
        id: 'r1',
        ciInstallationId: 'i1',
        prNumber: 4,
        ranAt: new Date('2026-10-01T00:00:00Z'),
        status: 'succeeded',
        findingsCount: 2,
        costUsd: 0.01,
        githubUrl: 'u',
        source: 'gha',
        agent: null,
        durationMs: 2500,
      },
      'Fallback',
    );
    expect(dto).toMatchObject({ ran_at: '2026-10-01T00:00:00.000Z', agent: 'Fallback', duration_s: 2.5 });
  });
});

describe('parseResultZip (AC-B16a, untrusted input)', () => {
  const ok = { findings_count: 2, cost_usd: 0.01, agent: 'A', pr_number: 3 };
  const zipOf = (name: string, content: string) => zipSync({ [name]: strToU8(content) });

  it('accepts a valid artifact', () => {
    expect(parseResultZip(zipOf('devdigest-result.json', JSON.stringify(ok)))).toMatchObject(ok);
  });
  it('rejects invalid JSON, wrong shape, wrong file name, oversize', () => {
    expect(parseResultZip(zipOf('devdigest-result.json', '{nope'))).toBeNull();
    expect(parseResultZip(zipOf('devdigest-result.json', '{"findings_count":"x"}'))).toBeNull();
    expect(parseResultZip(zipOf('other.json', JSON.stringify(ok)))).toBeNull();
    expect(parseResultZip(zipOf('devdigest-result.json', ' '.repeat(200_000)))).toBeNull();
    expect(parseResultZip(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('ignores path-traversal entry names (only the exact file name is read)', () => {
    expect(parseResultZip(zipOf('../devdigest-result.json', JSON.stringify(ok)))).toBeNull();
  });
});

describe('CiResultArtifact bounds (untrusted artifact)', () => {
  const base = { findings_count: 1, cost_usd: 0.1, agent: 'A' };
  it('accepts in-range values and rejects out-of-range ones', () => {
    expect(CiResultArtifact.safeParse(base).success).toBe(true);
    expect(CiResultArtifact.safeParse({ ...base, findings_count: 2_147_483_647 }).success).toBe(true);
    for (const bad of [
      { findings_count: 2_147_483_648 },
      { findings_count: -1 },
      { duration_ms: 3_000_000_000 },
      { pr_number: -5 },
      { critical: 2 ** 40 },
      { cost_usd: -0.5 },
      { agent: '' },
      { agent: 'x'.repeat(201) },
    ]) {
      expect(CiResultArtifact.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });
  it('parseResultZip returns null for an oversized count', () => {
    const zip = zipSync({ 'devdigest-result.json': strToU8(JSON.stringify({ ...base, findings_count: 3e9 })) });
    expect(parseResultZip(zip)).toBeNull();
  });
});

describe('ArtifactExpiredError', () => {
  it('is recognised by name', () => {
    expect(isArtifactExpiredError(new ArtifactExpiredError())).toBe(true);
    expect(isArtifactExpiredError(new Error('x'))).toBe(false);
  });
});
