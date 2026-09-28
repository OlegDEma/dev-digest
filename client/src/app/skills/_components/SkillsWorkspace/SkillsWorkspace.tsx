/* SkillsWorkspace — the /skills shell shared by the landing and the editor
   route: AppShell + the left rail + the single Add-skill modal, with the right
   column supplied by the page (editor, skeleton or empty state) as a render prop
   so it can open the modal the rail's "Add Skill" button does. The rail opens it
   on the Create tab; the landing empty state's Import button on the From file
   tab (the modal's tabs cover create / file / url). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { DEFAULT_TAB, type EditorTabKey } from "../../constants";
import { skillHref } from "../../helpers";
import { s } from "../../styles";
import { SkillsRail } from "./_components/SkillsRail";
import { CreateSkillModal, type AddTabKey } from "./_components/CreateSkillModal";

export interface SkillsWorkspaceApi {
  openCreate: () => void;
  openImport: () => void;
}

export function SkillsWorkspace({
  activeId,
  tab = DEFAULT_TAB,
  children,
}: {
  /** The skill open in the editor (null on the landing route). */
  activeId: string | null;
  /** Tab to keep when the user picks another skill in the rail. */
  tab?: EditorTabKey;
  children: (api: SkillsWorkspaceApi) => React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  // Which tab the Add-skill modal opens on, or null when it is closed.
  const [addTab, setAddTab] = React.useState<AddTabKey | null>(null);

  const api = React.useMemo<SkillsWorkspaceApi>(
    () => ({ openCreate: () => setAddTab("create"), openImport: () => setAddTab("file") }),
    [],
  );
  const onSelect = (skill: SkillSummary) => router.push(skillHref(skill.id, tab));

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {addTab && <CreateSkillModal initialTab={addTab} onClose={() => setAddTab(null)} />}
      <div style={s.shell}>
        <div style={s.rail}>
          <SkillsRail activeId={activeId} onSelect={onSelect} onCreate={api.openCreate} />
        </div>
        <div style={s.editorCol}>{children(api)}</div>
      </div>
    </AppShell>
  );
}
