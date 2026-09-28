/* SkillEditor — header (type icon · name · type chip · vN · Run on evals) and
   the tab bar: Config · Preview · Evals · Stats · Versions. Evals and Versions
   are placeholders (spec §10 D11); "Run on evals" just opens the Evals tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { EditorTabKey } from "../../constants";
import { typeColor } from "../../helpers";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: EditorTabKey;
  onTab: (tab: EditorTabKey) => void;
}) {
  const t = useTranslations("skills");
  const tc = typeColor(skill.type);
  // Plain labels, as in the design (no tab icons).
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }));

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div style={s.iconBox(tc.color, tc.bg)}>
          <Icon.Sparkles size={16} />
        </div>
        <h1 className="mono" style={s.title}>
          {skill.name}
        </h1>
        <Badge color={tc.color} bg={tc.bg}>
          {t(`card.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)" icon="GitCommit" mono>
          {t("editor.version", { version: skill.version })}
        </Badge>
        <div style={s.headActions}>
          <Button kind="secondary" size="sm" icon="Play" onClick={() => onTab("evals")}>
            {t("editor.runOnEvals")}
          </Button>
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => onTab(k as EditorTabKey)} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "evals" && <EvalsTab />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
