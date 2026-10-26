"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBrief, useGenerateBrief } from "../../../../../../../lib/hooks/brief";
import { notify } from "../../../../../../../lib/toast";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefSection } from "./_components/PrBriefSection";
import { BriefRiskAreas } from "./_components/BriefRiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
  pollWhileRunning: boolean;
  prBody: string | null | undefined;
  changedPaths?: string[];
  onOpenFile?: (path: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  repoId,
  repoFullName,
  headSha,
  prBody,
  pollWhileRunning,
  changedPaths,
  onOpenFile,
}: OverviewTabProps) {
  const t = useTranslations("brief");
  const q = usePrBrief(prId);
  const gen = useGenerateBrief(prId);
  const brief = q.data?.brief ?? null;
  const generating = gen.isPending;

  // A ref opens Files changed only when the file is in this PR's diff; a blast-only file stays here.
  const openRef = (path: string, line: number | null) => {
    if (changedPaths?.includes(path)) onOpenFile?.(path, line);
    else notify.info(t("prBrief.notInDiff"));
  };

  const riskAreas = brief ? (
    <BriefRiskAreas risks={brief.risks.risks} onOpenRef={openRef} />
  ) : generating ? (
    <div aria-busy="true" data-testid="risks-skeleton">
      <Skeleton height={48} />
    </div>
  ) : undefined;

  return (
    <>
      <PrBriefSection
        isLoading={q.isLoading}
        loadError={q.isError ? (q.error as Error) : null}
        onRetry={() => q.refetch()}
        brief={brief}
        stale={q.data?.stale ?? false}
        generating={generating}
        generateError={gen.isError ? (gen.error as Error) : null}
        onGenerate={() => gen.mutate()}
      />
      <div style={s.twoCol}>
        <IntentCard prId={prId} pollWhileRunning={pollWhileRunning} riskAreas={riskAreas} />
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      {(brief || generating) && <ReviewFocus items={brief?.review_focus ?? []} loading={!brief} onOpenRef={openRef} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
