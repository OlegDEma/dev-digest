/* query-client.ts — the app's QueryClient factory (shared by Providers and by
   tests that need the real global error surfacing). */
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { notify } from "./toast";
import { ApiError } from "./api";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
    // Global error surfacing (errors anywhere → toast). Mutations always
    // toast (they are user actions) unless they set `meta: { silentError: true }`
    // because they raise their own, more specific message. Queries only toast on
    // network/5xx — expected 4xx like a 404 "no tour yet" stay silent for inline
    // empty states.
    queryCache: new QueryCache({
      onError: (err) => {
        const status = err instanceof ApiError ? err.status : 500;
        if (status === 0 || status >= 500) notify.error(errorMessage(err));
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.meta?.silentError) return;
        notify.error(errorMessage(err));
      },
    }),
  });
}
