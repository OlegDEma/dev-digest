/* hooks/project-context.ts — React Query hooks for Project Context: the
   discovery listing, one document (read + in-place save) and the per-owner
   attach lists. Attach lists are saved on every change, so the mutation is
   optimistic and rolls back on failure. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  DiscoveredDocument,
  DocumentContent,
  ProjectContextListing,
  SaveDocumentBody,
  Skill,
} from "@devdigest/shared";

export type ContextOwnerKind = "agent" | "skill";

export function useProjectContext(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context", repoId],
    queryFn: () => api.get<ProjectContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextDocument(repoId: string | null | undefined, path: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["context-document", repoId, path],
    queryFn: () =>
      api.get<DocumentContent>(`/repos/${repoId}/context/document?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path && enabled,
    retry: false,
  });
}

export function useSaveContextDocument(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveDocumentBody) =>
      api.put<DiscoveredDocument>(`/repos/${repoId}/context/document`, body),
    // The save response has no text: write the saved text into the cached
    // document so the editor does not flash the old content before a refetch.
    onSuccess: (doc, body) => {
      qc.setQueryData<DocumentContent>(["context-document", repoId, body.path], (old) =>
        old ? { ...old, ...doc, text: body.text } : old,
      );
      qc.invalidateQueries({ queryKey: ["project-context", repoId] });
    },
  });
}

/** Per-owner promise chain: saves reach the server one at a time, in click order. */
const saveChains = new Map<string, Promise<unknown>>();
/** Owners with at least one failed save in the batch currently in flight. */
const failedBatches = new Set<string>();

/**
 * Replaces the owner's whole ordered attach list (`PUT …/context-docs`). The
 * cached owner is updated before the request.
 *
 * - Ordering: each PUT waits for the previous one of the same owner (a plain
 *   promise chain, not a mutation `scope`, which would stall while the tab is
 *   hidden). A slow earlier response can therefore never overwrite a later list.
 * - Server result: written to the cache only when no other save is in flight.
 * - Failure: with other saves still queued nothing is rolled back (the later
 *   list already contains the earlier change); with nothing queued the snapshot
 *   is restored. In both cases the owner is refetched once the batch drains, so
 *   the cache ends on the server's state.
 * - Messaging: `opts.onError` runs for EVERY failed save (a per-call `mutate`
 *   callback only fires for the latest) and the global toast is silenced via
 *   `meta.silentError`, so the user sees one tab-specific message per failure.
 */
export function useSetContextDocs(
  variant: ContextOwnerKind,
  ownerId: string,
  opts: { onError?: (err: Error) => void } = {},
) {
  const qc = useQueryClient();
  const key = [variant, ownerId];
  const chainId = `${variant}:${ownerId}`;
  const mutationKey = [variant, ownerId, "context-docs"];
  const url = variant === "agent" ? `/agents/${ownerId}/context-docs` : `/skills/${ownerId}/context-docs`;
  // The settling mutation still counts itself while its callbacks run.
  const othersPending = () => qc.isMutating({ mutationKey }) > 1;
  return useMutation({
    mutationKey,
    meta: { silentError: true },
    mutationFn: async (docs: string[]) => {
      const previous = saveChains.get(chainId) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(() => api.put<Agent | Skill>(url, { context_docs: docs }));
      saveChains.set(chainId, run);
      try {
        return await run;
      } finally {
        if (saveChains.get(chainId) === run) saveChains.delete(chainId);
      }
    },
    onMutate: async (docs) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Agent | Skill>(key);
      qc.setQueryData<Agent | Skill>(key, (old) => (old ? { ...old, context_docs: docs } : old));
      return { previous };
    },
    onError: (err, _docs, ctx) => {
      failedBatches.add(chainId);
      if (!othersPending() && ctx?.previous) qc.setQueryData(key, ctx.previous);
      opts.onError?.(err as Error);
    },
    onSuccess: (data) => {
      if (!othersPending()) qc.setQueryData(key, data);
    },
    onSettled: () => {
      if (!othersPending() && failedBatches.delete(chainId)) qc.invalidateQueries({ queryKey: key });
      // used-by counts on the page, attached counts on the list cards.
      qc.invalidateQueries({ queryKey: ["project-context"] });
      qc.invalidateQueries({ queryKey: [variant === "agent" ? "agents" : "skills"] });
    },
  });
}
