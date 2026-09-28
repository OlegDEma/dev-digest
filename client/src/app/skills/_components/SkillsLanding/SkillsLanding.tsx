/* SkillsLanding — /skills with nothing selected. As soon as the list loads it
   replaces the URL with the first skill's editor (name asc, the rail's order);
   an empty workspace shows the rail plus an empty state whose CTAs open the
   same create / import modals as "Add Skill". */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkills } from "../../../../lib/hooks/skills";
import { DEFAULT_TAB } from "../../constants";
import { skillHref } from "../../helpers";
import { s } from "../../styles";
import { SkillsWorkspace } from "../SkillsWorkspace";

export function SkillsLanding() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const first = skills?.[0];

  React.useEffect(() => {
    if (first) router.replace(skillHref(first.id, DEFAULT_TAB));
  }, [first, router]);

  return (
    <SkillsWorkspace activeId={null}>
      {({ openCreate, openImport }) => {
        if (isError) return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
        if (isLoading || first) {
          return (
            <div style={s.editorLoading}>
              <Skeleton height={24} width={240} />
              <Skeleton height={200} />
            </div>
          );
        }
        return (
          <div style={s.landing}>
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={openCreate}
            />
            <Button kind="secondary" size="sm" icon="Upload" onClick={openImport} style={{ marginTop: -8 }}>
              {t("page.empty.import")}
            </Button>
          </div>
        );
      }}
    </SkillsWorkspace>
  );
}
