/* hooks/intent.ts — React Query hooks for the PR Intent card: read the stored
   intent (with a stale flag) and explicitly recompute it. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/**
 * Stored intent for a PR. While a review is running and no intent exists yet,
 * poll — the run derives it as its first step.
 */
export function usePrIntent(
  prId: string | null | undefined,
  { pollWhileRunning = false }: { pollWhileRunning?: boolean } = {},
) {
  return useQuery({
    queryKey: ["pull-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    refetchInterval: (q) => (pollWhileRunning && !q.state.data?.intent ? 3000 : false),
  });
}

/**
 * A MUTATION, not a query: deriving costs a model call, so it must never fire
 * on mount or refocus. The response is the fresh record, so it seeds the cache.
 * Toasts are raised by the caller (translated copy lives in the component).
 */
export function useRecomputeIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`, {}),
    onSuccess: (data) => {
      qc.setQueryData(["pull-intent", prId], data);
    },
  });
}
