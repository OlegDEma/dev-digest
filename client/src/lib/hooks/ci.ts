/* hooks/ci.ts — React Query hooks for Export-to-CI and the CI Runs page:
     installations of one agent, export (preview `files` / publish `open_pr`),
     the newest ingested runs and the artifact refresh. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiInstallation, CiRefreshResult, CiRun } from "@devdigest/shared";

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/** `action: "files"` previews the bundle (writes nothing); `"open_pr"` publishes it. */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/export-ci`, body),
    onSuccess: (_res, body) => {
      if (body.action === "open_pr") {
        void qc.invalidateQueries({ queryKey: ["ci-installations", agentId] });
      }
    },
  });
}

export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRun[]>("/ci-runs"),
  });
}

export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci-runs/refresh"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}
