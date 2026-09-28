/* hooks/skills.ts — React Query hooks for the /skills page, the import flow and
   the agent editor's Skills tab (binding). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillSummary,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

// ---- skills ------------------------------------------------------------------

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillSummary[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** Paths the skill's rules are grounded in (set by the conventions extractor). */
  evidence_files?: string[];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // A content save (or a restore) snapshots a new version — refresh the tab.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

/** Body history for the Versions tab, newest version first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      // A deleted skill vanishes from every agent's bindings (cascade).
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/** Agents binding a skill — the delete confirm and the preview header. */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** The Stats tab — 30-day usage / pull / accept / findings + binding agents. */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

/**
 * Parse an uploaded .md / .zip into a preview. Nothing is persisted: the user
 * confirms in the modal and `useCreateSkill` stores what they approved.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_b64: string }) =>
      api.post<SkillImportPreview>("/skills/import", input),
  });
}

/**
 * Parse a remote `.md` / `.zip` at a URL into a preview. The server fetches it
 * (SSRF-guarded) and parses it; like the file flow, nothing is persisted until
 * `useCreateSkill` stores what the user confirmed.
 */
export function useImportSkillUrlPreview() {
  return useMutation({
    mutationFn: (input: { url: string }) => api.post<SkillImportPreview>("/skills/import-url", input),
  });
}

// ---- agent bindings (agents module routes) -----------------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * REPLACES the agent's whole ordered set of bound skills (`skill_ids`), which is
 * what the Skills tab's checkbox + reorder both need. (`{ skill_id }` would only
 * append one — see the agents routes.)
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      // used_by counts on the rail cards, skill_count on the agent cards, and
      // the Stats tab's "agents using this skill" list.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
      qc.invalidateQueries({ queryKey: ["skill-agents"] });
    },
  });
}

/**
 * ADDITIVE bind: appends one skill to an agent without touching the rest of its
 * set. `useSetAgentSkills` replaces the whole ordered set and would wipe the
 * agent's other skills, which is wrong when a newly created skill is being
 * attached from somewhere else (e.g. the Conventions board).
 */
export function useLinkAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_id: skillId }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
