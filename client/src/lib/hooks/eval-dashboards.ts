/* hooks/eval-dashboards.ts — React Query hooks for the per-agent eval dashboard,
   the batch "Run all agents" call and Promote. The per-agent dashboard key sits
   under ["eval-dashboard"], so every existing invalidation of the overview
   refreshes it too. A queued or running run is polled every 4 s. */
"use client";

import React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { EVAL_POLL_MS } from "./evals";
import type {
  AgentEvalDashboard,
  EvalBatchResult,
  EvalConfigSnapshot,
  EvalRange,
  EvalRunDetail,
  PromoteEvalBody,
  PromoteEvalResult,
} from "@devdigest/shared";

export function useAgentEvalDashboard(agentId: string | null | undefined, range: EvalRange) {
  return useQuery({
    queryKey: ["eval-dashboard", "agent", agentId, range],
    queryFn: () => api.get<AgentEvalDashboard>(`/agents/${agentId}/eval-dashboard?range=${range}`),
    enabled: !!agentId,
    refetchInterval: (query) =>
      (query.state.data?.runs ?? []).some((r) => r.status === "running" || r.status === "queued")
        ? EVAL_POLL_MS
        : false,
  });
}

/** One request for every eligible agent; the server answers with started / queued / skipped. */
export function useStartEvalBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalBatchResult>("/eval-runs/batch"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["eval-runs"] });
    },
  });
}

/** The agent's live config snapshot (no LLM call) — what Promote's staleness guard compares against. */
export function useAgentEvalConfig(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-config", agentId],
    queryFn: () => api.get<EvalConfigSnapshot>(`/agents/${agentId}/eval-config`),
    enabled: !!agentId,
  });
}

/** Copy a run's config onto the live agent (all-or-nothing on the server). */
export function usePromoteEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromoteEvalBody) => api.post<PromoteEvalResult>(`/agents/${agentId}/promote`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent", agentId] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
      void qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-config", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
    },
  });
}

const inFlight = (status: string | undefined) => !status || status === "running" || status === "queued";

/** Polls the runs a batch started; returns how many are still queued or running. Once none is, the
   overview is invalidated exactly once (the overview itself only lists finished runs, so it cannot poll). */
export function useWatchEvalRuns(runIds: readonly string[]): number {
  const qc = useQueryClient();
  const results = useQueries({
    queries: runIds.map((id) => ({
      queryKey: ["eval-run", id],
      queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${id}`),
      refetchInterval: (query: { state: { data?: EvalRunDetail } }) =>
        inFlight(query.state.data?.status) ? EVAL_POLL_MS : false,
    })),
  });
  const running = results.filter((r) => !r.isError && inFlight(r.data?.status)).length;
  const key = runIds.join(",");
  const doneFor = React.useRef("");
  React.useEffect(() => {
    if (runIds.length === 0 || running > 0 || doneFor.current === key) return;
    doneFor.current = key;
    void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
  }, [running, key, runIds.length, qc]);
  return running;
}
