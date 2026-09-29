/* CreateSkillModal — the "Add skill" modal. Three tabs: Create (from scratch),
   From file (.md / .zip upload → preview → confirm) and Import from URL (fetch a
   remote SKILL.md, SSRF-guarded, → preview → confirm). Every path ends in POST
   /skills and navigates into the editor. Opened from the rail's Add Skill button
   (Create tab) and the landing empty state's Import button (From file tab). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { DEFAULT_TAB } from "../../../../constants";
import { skillHref } from "../../../../helpers";
import { CreatePanel } from "./CreatePanel";
import { FilePanel } from "./FilePanel";
import { UrlPanel } from "./UrlPanel";
import { ADD_TABS, DEFAULT_ADD_TAB, MODAL_WIDTH, type AddTabKey } from "./constants";

export function CreateSkillModal({
  onClose,
  initialTab = DEFAULT_ADD_TAB,
}: {
  onClose: () => void;
  initialTab?: AddTabKey;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const [tab, setTab] = React.useState<AddTabKey>(initialTab);

  const finish = (skill: Skill) => {
    onClose();
    router.push(skillHref(skill.id, DEFAULT_TAB));
  };

  const tabs = ADD_TABS.map((k) => ({ key: k, label: t(`add.tabs.${k}`) }));

  return (
    <Modal width={MODAL_WIDTH} title={t("add.title")} onClose={onClose}>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddTabKey)} pad="0 24px" />
      {tab === "create" && <CreatePanel onCreated={finish} />}
      {tab === "file" && <FilePanel onCreated={finish} />}
      {tab === "url" && <UrlPanel onCreated={finish} />}
    </Modal>
  );
}
