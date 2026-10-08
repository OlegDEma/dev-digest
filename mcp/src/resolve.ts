import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from './api/port.js';
import { ToolFailure } from './errors.js';
import * as T from './texts.js';

export async function resolveRepo(api: DevDigestApi, repo: string): Promise<Repo> {
  const repos = await api.listRepos();
  const wanted = repo.trim().toLowerCase();
  const hit = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (hit) return hit;
  throw new ToolFailure(
    repos.length === 0
      ? T.repoNotFoundNoRepos(repo)
      : T.repoNotFound(repo, repos.map((r) => r.full_name)),
  );
}

/** Returns the PR with its (non-null) id. */
export async function resolvePr(
  api: DevDigestApi,
  repo: Repo,
  pr: number,
  tool = 'run_agent_on_pr',
): Promise<PrMeta & { id: string }> {
  const pulls = await api.listPulls(repo.id);
  const hit = pulls.find((p) => p.number === pr);
  if (!hit || !hit.id) throw new ToolFailure(T.prNotFound(pr, repo.full_name, tool));
  return { ...hit, id: hit.id };
}

/** Exact id first, then case-insensitive name. A disabled agent is refused (D9). */
export async function resolveAgent(api: DevDigestApi, agent: string): Promise<Agent> {
  const agents = await api.listAgents();
  const wanted = agent.trim().toLowerCase();
  const hit =
    agents.find((a) => a.id === agent.trim()) ?? agents.find((a) => a.name.toLowerCase() === wanted);
  if (!hit) throw new ToolFailure(T.agentNotFound(agent));
  if (!hit.enabled) throw new ToolFailure(T.agentDisabled(hit.name));
  return hit;
}
