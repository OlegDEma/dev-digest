/* hooks/history.ts — React Query hook for the Prior PRs footer:
     GET /pulls/:id/history → PrHistoryResponse (GitHub-backed; `available:false` when it can't be asked). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistoryResponse } from "@devdigest/shared";

export function usePrHistory(prId: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["pull-history", prId],
    queryFn: () => api.get<PrHistoryResponse>(`/pulls/${prId}/history`),
    enabled: !!prId && enabled,
    staleTime: 300_000,
  });
}
