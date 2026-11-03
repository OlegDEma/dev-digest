/* hooks/agent-stats.ts — rolling 30-day per-agent quality aggregates for the
   agents list card line and the agent editor's Stats tab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentStats } from "@devdigest/shared";

export function useAgentsStats() {
  return useQuery({
    queryKey: ["agents-stats"],
    queryFn: () => api.get<AgentStats[]>("/agents/stats"),
    staleTime: 30_000,
  });
}

export function useAgentStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", id],
    queryFn: () => api.get<AgentStats>(`/agents/${id}/stats`),
    enabled: !!id,
    staleTime: 30_000,
  });
}
