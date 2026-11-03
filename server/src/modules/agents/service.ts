import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentSkillLink,
  AgentStats,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { AgentStatsRepository } from './repository/agent-stats.repo.js';
import { validateContextDocs } from '../_shared/doc-path.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

/** Look-back window for the per-agent quality stats. */
const AGENT_STATS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class AgentsService {
  private repo: AgentsRepository;
  private statsRepo: AgentStatsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
    this.statsRepo = new AgentStatsRepository(container.db);
  }

  /** One stats row per workspace agent (zero-run agents included), last 30 days. */
  async stats(workspaceId: string): Promise<AgentStats[]> {
    const [agents, rows] = await Promise.all([
      this.repo.list(workspaceId),
      this.statsRepo.aggregate(workspaceId, this.statsSince()),
    ]);
    return agents.map((a) => this.toStats(a.id, a.name, rows));
  }

  async statsFor(workspaceId: string, id: string): Promise<AgentStats | undefined> {
    const agent = await this.repo.getById(workspaceId, id);
    if (!agent) return undefined;
    const rows = await this.statsRepo.aggregate(workspaceId, this.statsSince(), id);
    return this.toStats(agent.id, agent.name, rows);
  }

  private statsSince(): Date {
    return new Date(Date.now() - AGENT_STATS_WINDOW_DAYS * DAY_MS);
  }

  private toStats(
    agentId: string,
    agentName: string,
    rows: Awaited<ReturnType<AgentStatsRepository['aggregate']>>,
  ): AgentStats {
    const run = rows.runs.get(agentId);
    const f = rows.findings.get(agentId);
    const runs = run?.runs ?? 0;
    const accepted = f?.accepted ?? 0;
    const dismissed = f?.dismissed ?? 0;
    const pending = f?.pending ?? 0;
    const total = accepted + dismissed + pending;
    const acted = accepted + dismissed;
    return {
      agent_id: agentId,
      agent_name: agentName,
      runs,
      findings_total: total,
      accepted,
      dismissed,
      pending,
      accept_rate: acted > 0 ? accepted / acted : null,
      dismiss_rate: acted > 0 ? dismissed / acted : null,
      avg_findings_per_run: runs > 0 ? total / runs : null,
      total_cost_usd: run?.totalCostUsd ?? null,
      avg_cost_usd: run?.avgCostUsd ?? null,
      avg_latency_ms: run?.avgDurationMs ?? null,
      findings_by_severity: f?.bySeverity ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      trend: [],
    };
  }

  /** Every agent, decorated with how many skills it binds (for the list cards). */
  async list(workspaceId: string): Promise<Agent[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.skillCounts(workspaceId),
    ]);
    return rows.map((row) => ({ ...toAgentDto(row), skill_count: counts.get(row.id) ?? 0 }));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toAgentDto(row) : undefined;
  }

  /** Replace the agent's attached project-context paths (whole ordered list). */
  async setContextDocs(workspaceId: string, id: string, docs: string[]): Promise<Agent | undefined> {
    const valid = validateContextDocs(docs);
    const row = await this.repo.setContextDocs(workspaceId, id, valid);
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skill.id, order: l.order }));
  }

  /** A skill outside the caller's workspace is reported as not found; nothing is linked. */
  private async requireWorkspaceSkills(workspaceId: string, skillIds: string[]): Promise<void> {
    const unique = [...new Set(skillIds)];
    const have = await this.repo.skillIdsInWorkspace(workspaceId, unique);
    if (unique.some((id) => !have.has(id))) throw new NotFoundError('Skill not found');
  }

  /**
   * Set / reorder the agent's linked skills. If `skillIds` is provided, replaces
   * the whole set in that order. Returns the resulting ordered links.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.requireWorkspaceSkills(workspaceId, skillIds);
    await this.repo.setSkills(agentId, skillIds);
    return this.skillLinks(agentId);
  }

  /** Link a single skill (append or set order) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.requireWorkspaceSkills(workspaceId, [skillId]);
    const existing = await this.repo.linkedSkills(agentId);
    const resolvedOrder = order ?? existing.length;
    await this.repo.linkSkill(agentId, skillId, resolvedOrder);
    return this.skillLinks(agentId);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
