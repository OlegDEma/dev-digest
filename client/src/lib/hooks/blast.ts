/* hooks/blast.ts — React Query hook for the PR Blast radius block:
     GET /pulls/:id/blast → PrBlastResponse (read-only, from the repo-intel index). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBlastResponse } from "@devdigest/shared";

export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pull-blast", prId],
    queryFn: () => api.get<PrBlastResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
