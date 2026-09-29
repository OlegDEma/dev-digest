/* SkillEditorRoute — /skills/:id: the workspace shell with the tabbed editor
   in the right column. Tab state lives in ?tab= (like /agents/:id). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useSkill } from "../../../../lib/hooks/skills";
import { ApiError } from "../../../../lib/api";
import type { EditorTabKey } from "../../constants";
import { resolveTab, skillHref } from "../../helpers";
import { s } from "../../styles";
import { SkillsWorkspace } from "../SkillsWorkspace";
import { SkillEditor } from "../SkillEditor";

export function SkillEditorRoute() {
  const t = useTranslations("skills");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const tab = resolveTab(search.get("tab"));
  const setTab = (next: EditorTabKey) => router.replace(skillHref(id, next));

  return (
    <SkillsWorkspace activeId={id} tab={tab}>
      {() => {
        if (isError || (!isLoading && !skill)) {
          return (
            <ErrorState
              fullScreen
              title={t("page.loadErrorTitle")}
              body={error instanceof ApiError ? error.message : t("page.loadErrorBody")}
              onRetry={() => refetch()}
            />
          );
        }
        if (isLoading || !skill) {
          return (
            <div style={s.editorLoading}>
              <Skeleton height={24} width={240} />
              <Skeleton height={200} />
            </div>
          );
        }
        // key={skill.id} remounts the editor (and its Config form state) on switch.
        return <SkillEditor key={skill.id} skill={skill} tab={tab} onTab={setTab} />;
      }}
    </SkillsWorkspace>
  );
}
