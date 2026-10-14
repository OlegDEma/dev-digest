/* /repos/:repoId/onboarding — Onboarding Tour: a stored five-section guided
   tour of the repository. Opening the page only reads; generating is explicit. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { OnboardingTourView } from "./_components/OnboardingTourView";
import { s } from "./styles";

export default function OnboardingTourPage() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId && params.repoId !== "_" ? params.repoId : null;
  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("title") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {repoId ? (
          <OnboardingTourView key={repoId} repoId={repoId} />
        ) : (
          <EmptyState icon="Lightbulb" title={t("title")} body={t("page.noRepo")} />
        )}
      </div>
    </AppShell>
  );
}
