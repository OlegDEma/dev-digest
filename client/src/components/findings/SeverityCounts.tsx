/* SeverityCounts — the colored severity breakdown chips (icon + count per
   severity) shared by the PR timeline and the PR list. Renders one chip per
   NON-zero severity, ordered most-severe first, plus an optional "· N blockers".
   Purely presentational: it takes a counts object, never findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import { SEVERITY_ORDER, totalFindings, type SeverityCounts as Counts } from "@/lib/findings";

export function SeverityCounts({
  counts,
  blockers,
}: {
  counts: Counts;
  /** CI-gate blocker count (from the run row); shown as "· N blockers". */
  blockers?: number | null;
}) {
  const t = useTranslations("prReview");
  const shown = SEVERITY_ORDER.filter((sev) => counts[sev] > 0);
  const total = totalFindings(counts);

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      aria-label={t("timeline.findingsCount", { count: total })}
    >
      {shown.map((sev) => (
        <SeverityBadge key={sev} severity={sev as Severity} count={counts[sev]} compact />
      ))}
      {(blockers ?? 0) > 0 && (
        <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {t("runStatus.blockers", { count: blockers ?? 0 })}
        </span>
      )}
    </span>
  );
}
