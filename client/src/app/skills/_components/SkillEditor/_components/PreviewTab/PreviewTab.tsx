/* PreviewTab — the body rendered as the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { SkillMarkdown } from "../SkillMarkdown";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <div style={s.card}>
        <SkillMarkdown>{skill.body}</SkillMarkdown>
      </div>
    </div>
  );
}
