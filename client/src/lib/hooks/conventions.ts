/* hooks/conventions.ts — React Query hooks for the Conventions board: scan the
   repo, triage the candidates, and draft a skill from the accepted ones. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * A MUTATION, not a query: a scan costs a model call, so it must never fire on
 * mount, on refocus or on a retry. Its response already contains the full list,
 * so it seeds the list cache instead of forcing a refetch.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`, {}),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
    },
  });
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ConventionCandidate, "rule" | "rationale" | "category" | "status">>;
    }) => api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    // Patch the row in place rather than refetching: triage is a rapid-fire
    // interaction and a full reload would make the board jump under the cursor.
    onSuccess: (updated) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useDeleteConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/conventions/${id}`),
    onSuccess: (_void, id) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (prev) =>
        prev?.filter((c) => c.id !== id),
      );
    },
  });
}

/**
 * Build the skill body from the accepted candidates. Persists NOTHING — the
 * user edits the draft in the modal and only then does `useCreateSkill` save it.
 */
export function useConventionSkillDraft() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`, {}),
  });
}
