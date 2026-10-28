/* OnboardingTourView — the Onboarding Tour page body. Owns the read query and
   the generate mutation and picks the state: loading / load error / empty /
   tour. Opening the page never generates; only the buttons do. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingSection, OnboardingTour } from "@devdigest/shared";
import { useGenerateOnboardingTour, useOnboardingTour } from "../../../../../../lib/hooks/onboarding";
import { useActiveRepo } from "../../../../../../lib/repo-context";
import { ArchitectureBody } from "../ArchitectureBody";
import { FileRows } from "../FileRows";
import { FirstTasks } from "../FirstTasks";
import { RunCommands } from "../RunCommands";
import { TourBanners } from "../TourBanners";
import { TourHeader } from "../TourHeader";
import { TourSection } from "../TourSection";
import { TourToc } from "../TourToc";
import { s } from "./styles";

export function OnboardingTourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { data, isLoading, isError, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const { repos } = useActiveRepo();
  const defaultBranch = repos.find((r) => r.id === repoId)?.default_branch;

  if (isLoading) return <Skeleton height={240} />;
  if (isError || !data) {
    return <ErrorState title={t("loadError.title")} onRetry={() => void refetch()} />;
  }

  const generating = generate.isPending || data.generation_in_progress;
  const run = () => generate.mutate();
  const { tour } = data;

  if (!tour) {
    return (
      <div>
        <TourBanners
          tour={null}
          lastFailure={null}
          currentIndex={data.current_index}
          generateError={generate.error}
        />
        <div style={s.empty}>
          <h1 style={s.emptyTitle}>{t("empty.title")}</h1>
          <p style={s.emptyBody}>{t("empty.body")}</p>
          <Button kind="primary" icon="Lightbulb" disabled={generating} onClick={run}>
            {generating ? t("generate.generating") : t("empty.cta")}
          </Button>
        </div>
      </div>
    );
  }

  const fileProps = { repoFullName: data.repo_full_name, sha: tour.index.last_indexed_sha, defaultBranch };

  return (
    <div>
      <TourHeader
        repoName={data.repo_full_name}
        tour={tour}
        currentIndex={data.current_index}
        generating={generating}
        onRegenerate={run}
      />
      <TourBanners
        tour={tour}
        lastFailure={data.last_failure}
        currentIndex={data.current_index}
        generateError={generate.error}
      />
      <TourToc />
      {tour.sections.map((section) => (
        <TourSection key={section.kind} section={section} tour={tour}>
          {renderBody(section, tour, fileProps)}
        </TourSection>
      ))}
    </div>
  );
}

function renderBody(
  section: OnboardingSection,
  tour: OnboardingTour,
  fileProps: { repoFullName: string; sha: string | null; defaultBranch: string | null | undefined },
): React.ReactNode {
  switch (section.kind) {
    case "architecture_overview":
      return <ArchitectureBody body={section.body_markdown} diagram={section.diagram} />;
    case "critical_paths":
      return <FileRows {...fileProps} rows={section.items.map((item) => ({ kind: "critical" as const, item }))} />;
    case "run_locally":
      return <RunCommands items={section.items} skipped={tour.skipped_files} />;
    case "reading_path":
      return (
        <FileRows
          {...fileProps}
          rankedByImportGraph={!tour.index.hotness_available}
          rows={section.items.map((item) => ({ kind: "reading" as const, item }))}
        />
      );
    case "first_tasks":
      return <FirstTasks {...fileProps} items={section.items} />;
  }
}
