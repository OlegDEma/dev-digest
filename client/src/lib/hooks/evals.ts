/* hooks/evals.ts — React Query hooks for the agent eval pipeline:
     cases (GET/POST/PUT/DELETE), finding draft (GET), create-from-finding (POST),
     runs (POST/GET), dashboard.
   A running or queued run is polled every 4 s; polling continues through a failed
   tick (data stays in cache), so a transient error recovers on the next interval. */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreateEvalCaseBody,
  CreateEvalCaseResponse,
  EvalCase,
  EvalCaseDraft,
  EvalCaseDraftBody,
  EvalDashboardOverview,
  EvalRunDetail,
  EvalRunSummary,
  StartEvalRunBody,
} from "@devdigest/shared";

export const EVAL_POLL_MS = 4000;

/** A run that still occupies the agent: `queued` or `running`. */
const isActive = (r: Pick<EvalRunSummary, "status">) => r.status === "running" || r.status === "queued";

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

/** Create a hand-written (or draft-based) case; `source_finding_id` links it to a finding. */
export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEvalCaseBody) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, body),
    meta: { silentError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Replace a case's content (a rename keeps `revision`); refreshes the case list. */
export function useUpdateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EvalCaseDraftBody }) =>
      api.put<EvalCase>(`/eval-cases/${id}`, body),
    meta: { silentError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Editor prefill for a finding (nothing is persisted); 409 `eval_case_exists` when a case already exists. */
export function useEvalCaseDraft(findingId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-draft", findingId],
    queryFn: () => api.get<EvalCaseDraft>(`/findings/${findingId}/eval-case-draft`),
    enabled: !!findingId,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Turn a decided finding into an eval case (201 created / 200 already existed). */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<CreateEvalCaseResponse>(`/findings/${findingId}/eval-case`),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", res.case.owner_id] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** The agent's runs, polled every 4 s while any is `running` or `queued`. This is the single place that
   notices a run leaving `running` (it covers runs tracked only via this list, e.g. after a
   reload) and refetches what shows its outcome: cases' last result, the list, the dashboard. */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalRunSummary[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (query) => ((query.state.data ?? []).some(isActive) ? EVAL_POLL_MS : false),
  });
  const runs = q.data;
  const prevRunning = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!runs) return;
    const statusById = new Map(runs.map((r) => [r.id, r.status]));
    const finished = [...prevRunning.current].some((id) => {
      const status = statusById.get(id);
      return status !== "running" && status !== "queued";
    });
    prevRunning.current = new Set(runs.filter(isActive).map((r) => r.id));
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
    refetchInterval: (query) => (query.state.data && isActive(query.state.data) ? EVAL_POLL_MS : false),
  });
}

/** Start a run (all cases, or one with `{ case_id }`). Errors surface as `ApiError` (`code`, `details.run_id` on 409).
   Pass `silentError` only when the caller shows the error inline, so the global toast does not repeat it. */
export function useStartEvalRun(agentId: string | null | undefined, opts: { silentError?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    ...(opts.silentError ? { meta: { silentError: true } } : {}),
    mutationFn: (body?: StartEvalRunBody) => api.post<EvalRunSummary>(`/agents/${agentId}/eval-runs`, body),
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
      (query.state.data?.agents ?? []).some((a) => !!a.last_full_run && isActive(a.last_full_run)) ||
      (query.state.data?.recent_runs ?? []).some(isActive)
        ? EVAL_POLL_MS
        : false,
  });
}
