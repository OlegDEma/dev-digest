import { unzipSync } from 'fflate';
import { CiResultArtifact, isArtifactExpiredError } from '@devdigest/shared';
import type {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiRefreshResult,
  CiRun,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import type { RequestContext } from '../_shared/context.js';
import { CiRepository } from './repository/ci.repo.js';
import {
  CI_BRANCH,
  CI_PR_TITLE,
  WORKFLOW_FILE,
  ARTIFACT_NAME,
  RESULT_FILE,
  INGEST_WINDOW_DAYS,
  RUNS_LIMIT,
  MAX_ZIP_BYTES,
  MAX_RESULT_BYTES,
  PR_TRIGGER_TYPES,
} from './constants.js';
import {
  agentSlug,
  buildManifest,
  buildManifestFile,
  buildWorkflowYaml,
  ciRunStatus,
  manifestPath,
  providerKeyVar,
  skillFile,
  skillSlugs,
  toCiInstallationDto,
  toCiRunDto,
  workflowFile,
} from './helpers.js';

function splitRepo(fullName: string): RepoRef {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Parse an untrusted artifact zip into a validated result, or null. */
export function parseResultZip(zip: Uint8Array): CiResultArtifact | null {
  if (zip.byteLength > MAX_ZIP_BYTES) return null;
  try {
    const files = unzipSync(zip, {
      filter: (f) => f.name === RESULT_FILE && f.originalSize <= MAX_RESULT_BYTES,
    });
    const raw = files[RESULT_FILE];
    if (!raw) return null;
    const parsed = CiResultArtifact.safeParse(JSON.parse(new TextDecoder().decode(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * CI export + run ingest. Publishing writes to GitHub only on `open_pr`; the
 * `files` preview is pure generation. No LLM calls anywhere in this module.
 */
export class CiService {
  private readonly repo: CiRepository;
  private readonly repos: RepoRepository;

  constructor(private readonly container: Container) {
    this.repo = new CiRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async export(ctx: RequestContext, agentId: string, input: CiExportInput): Promise<CiExport> {
    const agent = await this.requireAgent(ctx.workspaceId, agentId);
    if (input.target !== 'gha') {
      throw new AppError('unsupported_target', `Target "${input.target}" is not supported yet`, 422);
    }
    const bad = input.triggers.filter((x) => !(PR_TRIGGER_TYPES as readonly string[]).includes(x));
    if (input.triggers.length === 0 || bad.length > 0) {
      throw new AppError(
        'invalid_triggers',
        bad.length > 0 ? `Unknown pull_request trigger(s): ${bad.join(', ')}` : 'At least one trigger is required',
        422,
      );
    }
    const repoRow = await this.repos.findByFullName(ctx.workspaceId, input.repo);
    if (!repoRow) {
      throw new AppError('repo_not_connected', `Repository ${input.repo} is not connected`, 422);
    }

    const linked = await this.container.agentsRepo.enabledSkillsForPrompt(agent.id);
    const skills = linked.map((l) => ({ name: l.skill.name, body: l.skill.body }));
    const slug = agentSlug(agent.name);
    const manifest = buildManifest(agent, skills, input.post_as);
    const slugs = skillSlugs(skills);
    const files = [
      workflowFile(
        buildWorkflowYaml({
          runnerRef: this.container.config.runnerRef,
          triggers: input.triggers,
          keyVar: providerKeyVar(agent.provider),
          agentSlug: slug,
        }),
      ),
      { path: manifestPath(slug), contents: buildManifestFile(manifest), editable: false },
      ...skills.map((s, i) => skillFile(slugs[i]!, s)),
    ];

    if (input.action === 'files') {
      return {
        installation: {
          id: '',
          agent_id: agent.id,
          repo: repoRow.fullName,
          target_type: 'gha',
          installed_at: new Date().toISOString(),
        },
        files,
        pr_url: null,
      };
    }

    let prUrl: string;
    try {
      const gh = await this.container.github();
      const ref = splitRepo(repoRow.fullName);
      await gh.commitFiles(ref, {
        branch: CI_BRANCH,
        base: input.base,
        message: CI_PR_TITLE,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await gh.findOpenPr(ref, CI_BRANCH);
      prUrl = (
        existing ??
        (await gh.openPullRequest(ref, {
          title: CI_PR_TITLE,
          head: CI_BRANCH,
          base: input.base,
          body: `Adds the DevDigest agent "${agent.name}" as a pull-request review in CI.`,
        }))
      ).url;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('github_write_failed', message(err), 502);
    }

    const row = await this.repo.insertInstallation({
      agentId: agent.id,
      repo: repoRow.fullName,
      targetType: 'gha',
    });
    return { installation: toCiInstallationDto(row), files, pr_url: prUrl };
  }

  async listInstallations(ctx: RequestContext, agentId: string): Promise<CiInstallation[]> {
    await this.requireAgent(ctx.workspaceId, agentId);
    return (await this.repo.listInstallations(agentId)).map(toCiInstallationDto);
  }

  async listRuns(ctx: RequestContext): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(ctx.workspaceId, RUNS_LIMIT);
    return rows.map((r) => toCiRunDto(r.run, r.agentName));
  }

  async refresh(ctx: RequestContext): Promise<CiRefreshResult> {
    const installs = await this.repo.installationsForWorkspace(ctx.workspaceId);
    const byRepo = new Map<string, typeof installs>();
    for (const i of installs) byRepo.set(i.repo, [...(byRepo.get(i.repo) ?? []), i]);

    const agentNames = new Map<string, string>();
    const nameOf = async (agentId: string) => {
      if (!agentNames.has(agentId)) {
        const a = await this.container.agentsRepo.getById(ctx.workspaceId, agentId);
        agentNames.set(agentId, a?.name ?? '');
      }
      return agentNames.get(agentId)!;
    };

    let ingested = 0;
    let skipped = 0;
    const since = new Date(Date.now() - INGEST_WINDOW_DAYS * 86_400_000).toISOString();

    try {
      const gh = await this.container.github();
      for (const [fullName, group] of byRepo) {
        const ref = splitRepo(fullName);
        const runs = (await gh.listWorkflowRuns(ref, WORKFLOW_FILE, since)).filter(
          (r) => r.conclusion != null,
        );
        const known = await this.repo.existingGithubRunIds(runs.map((r) => r.id));
        for (const run of runs.filter((r) => !known.has(r.id))) {
          const artifacts = await gh.listRunArtifacts(ref, run.id);
          const art = artifacts.find((a) => a.name === ARTIFACT_NAME && !a.expired);
          if (!art) {
            skipped++;
            continue;
          }
          let zip: Uint8Array;
          try {
            zip = await gh.downloadArtifactZip(ref, art.id);
          } catch (err) {
            if (isArtifactExpiredError(err)) {
              skipped++;
              continue;
            }
            throw err;
          }
          const result = parseResultZip(zip);
          if (!result) {
            skipped++;
            continue;
          }
          let inst = group[0]!;
          for (const g of group) {
            if ((await nameOf(g.agentId)) === result.agent) {
              inst = g;
              break;
            }
          }
          try {
            const added = await this.repo.insertCiRunIfNew({
              ciInstallationId: inst.id,
              prNumber: result.pr_number ?? null,
              ranAt: new Date(run.created_at),
              status: ciRunStatus(run.conclusion, result.findings_count),
              findingsCount: result.findings_count,
              costUsd: result.cost_usd,
              githubUrl: run.html_url,
              source: 'gha',
              githubRunId: run.id,
              agent: result.agent,
              durationMs: result.duration_ms ?? null,
            });
            if (added) ingested++;
          } catch {
            // One bad row must not abort the batch.
            skipped++;
          }
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('github_read_failed', message(err), 502);
    }
    return { ingested, skipped };
  }
}
