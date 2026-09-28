/* SkillsRail — the left column of /skills: "Skills" + a single Add Skill button,
   a search box and one SkillRailCard per workspace skill. Add Skill opens the
   Add-skill modal on its Create tab (from scratch); file / URL import live as
   tabs inside that modal. Selecting a card is navigation (the parent owns the
   route); the enabled toggle PUTs immediately. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useSkills, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { filterSkills } from "../../../../helpers";
import { SkillRailCard } from "../SkillRailCard";
import { s } from "./styles";

export function SkillsRail({
  activeId,
  onSelect,
  onCreate,
}: {
  activeId: string | null;
  onSelect: (skill: SkillSummary) => void;
  onCreate: () => void;
}) {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills ?? [], search);

  return (
    <>
      <div style={s.head}>
        <div style={s.headRow}>
          <h1 style={s.title}>{t("rail.heading")}</h1>
          <Button kind="primary" size="sm" icon="Plus" onClick={onCreate}>
            {t("rail.addSkill")}
          </Button>
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("rail.searchPlaceholder")}
            aria-label={t("rail.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.list} role="list" aria-label={t("rail.heading")}>
        {isLoading && (
          <>
            <Skeleton height={150} />
            <div style={{ height: 10 }} />
            <Skeleton height={150} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (skills?.length ?? 0) > 0 && list.length === 0 && (
          <div style={s.noMatch}>{t("rail.noMatch")}</div>
        )}
        {list.map((sk) => (
          <div key={sk.id} role="listitem">
            <SkillRailCard
              skill={sk}
              active={sk.id === activeId}
              onClick={() => onSelect(sk)}
              onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
            />
          </div>
        ))}
      </div>
    </>
  );
}
