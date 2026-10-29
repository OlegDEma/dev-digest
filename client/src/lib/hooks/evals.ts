/* hooks/evals.ts — React Query hooks for the agent eval pipeline:
     cases (GET/DELETE), create-from-finding (POST), runs (POST/GET), dashboard.
   A running run is polled every 4 s; polling continues through a failed tick
   (data stays in cache), so a transient error recovers on the next interval. */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreateEvalCaseResponse,
  EvalCase,
  EvalDashboardOverview,
  EvalRunDetail,
  EvalRunSummary,
} from "@devdigest/shared";

export const EVAL_POLL_MS = 4000;

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Delete one eval case; refreshes the case list (past results keep the run-time name). */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<void>(`/eval-cases/${caseId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Turn a decided finding into an eval case (201 created / 200 already existed). */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<CreateEvalCaseResponse>(`/findings/${findingId}/eval-case`),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", res.case.owner_id] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** The agent's runs, polled every 4 s while any is `running`. This is the single place that
   notices a run leaving `running` (it covers runs tracked only via this list, e.g. after a
   reload) and refetches what shows its outcome: cases' last result, the list, the dashboard. */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalRunSummary[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
  const runs = q.data;
  const prevRunning = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!runs) return;
    const statusById = new Map(runs.map((r) => [r.id, r.status]));
    const finished = [...prevRunning.current].some((id) => statusById.get(id) !== "running");
    prevRunning.current = new Set(runs.filter((r) => r.status === "running").map((r) => r.id));
    if (finished) {
      void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    }
  }, [runs, agentId, qc]);
  return q;
}

/** One run with its per-case results; polls every 4 s while it is `running`. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });
}

/** Start a run. Errors surface as `ApiError` (`code`, `details.run_id` on 409). */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunSummary>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardOverview>("/eval-dashboard"),
    refetchInterval: (query) =>
      (query.state.data?.agents ?? []).some((a) => a.last_run?.status === "running") ||
      (query.state.data?.recent_runs ?? []).some((r) => r.status === "running")
        ? EVAL_POLL_MS
        : false,
  });
}
