/* /repos/:repoId/context — Project Context: browse, preview and edit the
   specs / docs / insights Markdown files of the repository clone. Attaching
   them to agents and skills happens on their Context tabs. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { ProjectContextView } from "./_components/ProjectContextView";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId && params.repoId !== "_" ? params.repoId : null;
  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("title") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {repoId ? (
          <ProjectContextView repoId={repoId} />
        ) : (
          <EmptyState icon="FileText" title={t("title")} body={t("page.noRepo")} />
        )}
      </div>
    </AppShell>
  );
}
