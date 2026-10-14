/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour: the stored
   tour (read never generates; polls while the server reports a running
   generation) and the explicit generate/regenerate mutation. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourResponse } from "@devdigest/shared";

const POLL_MS = 3000;

export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.generation_in_progress ? POLL_MS : false),
  });
}

/** Explicit action only — nothing here fires on mount. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourResponse>(`/repos/${repoId}/onboarding/generate`),
    // The page shows its own inline error; no global toast on top of it.
    meta: { silentError: true },
    onSuccess: (res) => {
      qc.setQueryData<OnboardingTourResponse>(["onboarding", repoId], res);
    },
    // A 409 means another tab is generating: refetch so `generation_in_progress`
    // is seen and polling starts.
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["onboarding", repoId] });
    },
  });
}
