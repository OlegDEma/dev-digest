/* PrMetaTab — the simulated PR's title and description. Both reach the model
   only inside the engine's untrusted fencing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Textarea, TextInput } from "@devdigest/ui";
import { s } from "./styles";

export function PrMetaTab({
  title,
  description,
  onTitle,
  onDescription,
  titleProblem,
  descriptionProblem,
}: {
  title: string;
  description: string;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  titleProblem: string | null;
  descriptionProblem: string | null;
}) {
  const t = useTranslations("eval");
  return (
    <div>
      <div style={s.field}>
        <label>
          <span style={s.label}>{t("caseEditor.titleLabel")}</span>
          <TextInput value={title} onChange={onTitle} placeholder={t("caseEditor.titlePlaceholder")} />
        </label>
        {titleProblem && (
          <div role="alert" style={s.error}>
            {titleProblem}
          </div>
        )}
      </div>
      <div style={s.field}>
        <label>
          <span style={s.label}>{t("caseEditor.bodyLabel")}</span>
          <Textarea rows={6} value={description} onChange={onDescription} placeholder={t("caseEditor.bodyPlaceholder")} />
        </label>
        {descriptionProblem && (
          <div role="alert" style={s.error}>
            {descriptionProblem}
          </div>
        )}
      </div>
    </div>
  );
}
