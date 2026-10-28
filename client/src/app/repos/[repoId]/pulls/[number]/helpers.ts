/* Pure URL helpers for the PR detail page (deep link to a file/line in Files changed). */

/** Patch for the query string: a string sets the key, `null` removes it. */
export type SearchPatch = Record<string, string | number | null>;

/** Builds `/repos/:repoId/pulls/:number?…` from the current query plus a patch. */
export function buildPrHref(
  repoId: string,
  number: string | number,
  search: { toString(): string },
  patch: SearchPatch,
): string {
  const sp = new URLSearchParams(search.toString());
  for (const [key, val] of Object.entries(patch)) {
    if (val == null) sp.delete(key);
    else sp.set(key, String(val));
  }
  const qs = sp.toString();
  return `/repos/${repoId}/pulls/${number}${qs ? `?${qs}` : ""}`;
}

/** `?line=` → a positive integer, else null (0, negatives, decimals, junk). */
export function parseLineParam(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
