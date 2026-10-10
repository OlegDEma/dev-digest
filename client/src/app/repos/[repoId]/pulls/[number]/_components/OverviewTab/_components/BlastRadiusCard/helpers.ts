import type { BlastCounts, PrBlastResponse } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";

/** Caller lines refer to the indexed commit, so links pin to it (head SHA only if the index has none). */
export function linkSha(data: Pick<PrBlastResponse, "index_sha">, headSha: string): string {
  return data.index_sha ?? headSha;
}

export function callerHref(
  repoFullName: string | null,
  sha: string,
  file: string,
  line: number,
): string | null {
  return repoFullName ? githubBlobUrl(repoFullName, sha, file, line) : null;
}

export interface StatItem {
  key: keyof BlastCounts;
  icon: IconName;
  value: number;
}

export function statItems(counts: BlastCounts): StatItem[] {
  return [
    { key: "symbols", icon: "Code", value: counts.symbols },
    { key: "callers", icon: "CornerDownRight", value: counts.callers },
    { key: "endpoints", icon: "Globe", value: counts.endpoints },
    { key: "crons", icon: "Clock", value: counts.crons },
  ];
}
