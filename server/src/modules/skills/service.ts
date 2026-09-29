import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillSummary,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { EMPTY_METRICS, buildImportPreview, ratesFor, toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills service — business logic for the /skills page and the import flow.
 *
 * A skill = name + directive description + type + markdown body + enabled. It
 * is text and configuration only: nothing here (or anywhere) executes a skill.
 * Content edits are versioned via `skill_versions` (repository). Import is a
 * two-step, explicit flow: `importPreview` parses and returns a preview without
 * persisting; the client then calls `create` with what the user confirmed.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** Paths the skill's content is grounded in (conventions extractor). */
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;
  /** Typed via the container so the service never imports the concrete adapter. */
  private fetcher: Container['urlFetcher'];

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
    this.fetcher = container.urlFetcher;
  }

  /**
   * Every workspace skill decorated with how many agents bind it and its 30-day
   * pull / accept rates (null = no denominator, rendered as "—").
   */
  async list(workspaceId: string): Promise<SkillSummary[]> {
    const [rows, usedBy, runsTotal, metrics] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.usedByCounts(workspaceId),
      this.repo.runsInWindow(workspaceId),
      this.repo.runMetrics(workspaceId),
    ]);
    return rows.map((row) => ({
      ...toSkillDto(row),
      used_by: usedBy.get(row.id) ?? 0,
      ...ratesFor(metrics.get(row.id) ?? EMPTY_METRICS, runsTotal),
    }));
  }

  /**
   * The Stats tab: real 30-day numbers attributed through `agent_run_skills`
   * (specs/03-skills.md §10.3). undefined → no such skill in this workspace.
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const [agents, runsTotal, metrics] = await Promise.all([
      this.repo.agentsUsing(workspaceId, id),
      this.repo.runsInWindow(workspaceId),
      this.repo.runMetrics(workspaceId, id),
    ]);
    const m = metrics.get(id) ?? EMPTY_METRICS;
    return {
      used_by: agents.length,
      runs_30d: runsTotal,
      runs_with_skill_30d: m.runs,
      findings_30d: m.findings,
      accepted_30d: m.accepted,
      dismissed_30d: m.dismissed,
      ...ratesFor(m, runsTotal),
      agents,
    };
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name.trim(),
      description: input.description.trim(),
      type: input.type,
      body: input.body,
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill; its agent bindings and version history cascade. */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Agents binding a skill (for the delete confirm). undefined → no such skill. */
  async agentsUsing(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string }[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.agentsUsing(workspaceId, id);
  }

  /** Body history, newest first. undefined → no such skill in this workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Parse an uploaded `.md` / `.zip` into a preview. Pure and side-effect free:
   * nothing is stored, extracted or run — the user confirms in the UI and the
   * client persists the (possibly edited) preview through `create`.
   */
  importPreview(filename: string, contentB64: string): SkillImportPreview {
    return buildImportPreview(filename, contentB64);
  }

  /**
   * Fetch a remote `.md` / `.zip` and parse it into the same preview as a file
   * upload. The fetch is SSRF-guarded in the adapter (http(s) only, no private
   * hosts, size/time/redirect caps); parsing is the same pure path — nothing is
   * stored or executed until the user confirms with `create`.
   */
  async importUrlPreview(url: string): Promise<SkillImportPreview> {
    const { bytes, filename } = await this.fetcher.fetch(url);
    const contentB64 = Buffer.from(bytes).toString('base64');
    return buildImportPreview(filename, contentB64);
  }
}
