import path from 'node:path';
import type { CiResultArtifact, LLMProvider } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, type ReviewOutcome } from '@devdigest/reviewer-core';
import { loadManifest } from './manifest.js';
import { loadSkillBlocks } from './skills.js';
import { resolvePrContext } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildArtifact, writeArtifact } from './artifact.js';
import { shouldFail } from './gate.js';
import { RunnerError } from './errors.js';

export interface RunCiDeps {
  env: NodeJS.ProcessEnv;
  /** Directory holding `agents/` and `skills/` (the checked-in `.devdigest/`). */
  devdigestDir: string;
  /** Where `devdigest-result.json` is written — always, success or failure. */
  resultPath: string;
  /** Builds the LLM for the manifest's provider (OpenRouterProvider in production). */
  makeLlm: (provider: string, env: NodeJS.ProcessEnv) => LLMProvider;
  fetchImpl?: FetchLike;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface RunCiResult {
  exitCode: 0 | 1;
  artifact: CiResultArtifact;
  error?: string;
}

/**
 * Orchestrates one CI review. The result artifact is written after every outcome, so a
 * failed run still leaves `devdigest-result.json` for the workflow's
 * `if: always()` upload step. Errors are reported by message only — never the
 * environment, which holds the tokens.
 */
export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.log(m));
  const start = now();
  let agent = 'unknown';
  let prNumber: number | null = null;
  let findings: { severity: string }[] = [];
  let costUsd: number | null = null;
  let failGate = false;
  let error: string | undefined;

  try {
    const manifest = loadManifest(deps.devdigestDir);
    agent = manifest.name;
    const ctx = resolvePrContext(deps.env);
    prNumber = ctx.prNumber;
    const token = deps.env.GITHUB_TOKEN;
    if (!token) throw new RunnerError('GITHUB_TOKEN is not set');
    const skills = loadSkillBlocks(deps.devdigestDir, manifest.skills);
    const llm = deps.makeLlm(manifest.provider, deps.env);

    const raw = stripIgnoredFiles(await fetchPrDiff(ctx, token, deps.fetchImpl));
    const diff = parseUnifiedDiff(raw);
    const outcome: ReviewOutcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      strategy: manifest.strategy,
      diff,
      llm,
      skills,
    });
    findings = outcome.review.findings;
    costUsd = outcome.costUsd;

    if (manifest.post_as !== 'none') {
      const payload = toReviewPayload(outcome.review, { failOn: manifest.ci_fail_on, diff });
      if (manifest.post_as === 'github_review') {
        await postGithubReview(ctx, token, payload, deps.fetchImpl);
      } else {
        await postPrComment(ctx, token, payload.body, deps.fetchImpl);
      }
    }
    failGate = shouldFail(findings, manifest.ci_fail_on);
    log(`devdigest: ${findings.length} finding(s)${failGate ? ' — gate tripped' : ''}`);
  } catch (err) {
    error = err instanceof Error ? err.message : 'unknown error';
    log(`devdigest: failed — ${error}`);
  }

  const artifact = buildArtifact({
    findings,
    costUsd,
    durationMs: now() - start,
    agent,
    version: deps.env.GITHUB_SHA?.slice(0, 7) ?? null,
    prNumber,
  });
  try {
    writeArtifact(path.resolve(deps.resultPath), artifact);
  } catch (err) {
    error ??= `cannot write artifact: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
  return { exitCode: error || failGate ? 1 : 0, artifact, ...(error ? { error } : {}) };
}
