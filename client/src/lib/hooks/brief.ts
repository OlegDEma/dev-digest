/* hooks/brief.ts — React Query hooks for the PR Brief: read the stored brief
   (with a stale flag) and explicitly generate/refresh it. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** Stored brief for a PR. A plain GET: it never calls the model and never polls. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pull-brief", prId],
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/**
 * A MUTATION, not a query: generating costs a model call, so it must never fire
 * on mount or refocus. `silentError` because the section shows the message inline
 * (the global handler would toast the same text a second time).
 */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`, {}),
    meta: { silentError: true },
    onSuccess: (data) => {
      qc.setQueryData(["pull-brief", prId], data);
    },
  });
}
