/* EvalsTab — placeholder until the Eval lesson lands (spec §10 D11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evals.title")} body={t("evals.body")} />;
}
