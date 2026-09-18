/* PrFindingsCell — the PR-list FINDINGS column. Always-visible severity chips
   come from the denormalized `pr.findings_by_severity` (computed on the list
   endpoint); the hover card's finding details are fetched lazily on first open
   via the existing reviews endpoint, so the list payload stays lean and the
   numbers reconcile (both use the "latest review per agent" rule). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { currentFindings } from "@/lib/findings";
import { SeverityCounts, FindingsHoverCard } from "@/components/findings";
import { s } from "../../styles";

export function PrFindingsCell({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const router = useRouter();
  const counts = pr.findings_by_severity;
  // Enable the reviews query only after the card first opens (hover/focus).
  const [active, setActive] = React.useState(false);
  const reviews = usePrReviews(active && pr.id ? pr.id : null);

  if (!counts) return <span style={s.muted}>—</span>;

  const findings = reviews.data ? currentFindings(reviews.data) : [];
  return (
    <FindingsHoverCard
      findings={findings}
      loading={reviews.isLoading}
      headSha={pr.head_sha}
      onOpenChange={(open) => {
        if (open) setActive(true);
      }}
      onFindingClick={(f) =>
        router.push(`/repos/${repoId}/pulls/${pr.number}?tab=findings&finding=${f.id}`)
      }
    >
      <SeverityCounts counts={counts} />
    </FindingsHoverCard>
  );
}
