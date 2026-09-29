/* SkillRailCard — one skill in the left rail: type-coloured icon, name, current
   version, enabled toggle, delete, one-line description, type chip + source, and
   the 30-day stats line (`N agents · P% pull · A% accept`, "—" when a rate has
   no denominator). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ConfirmDialog, Icon, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../../../lib/hooks/skills";
import { SOURCE_ICON } from "../../../../constants";
import { typeColor } from "../../../../helpers";
import { s } from "./styles";

export function SkillRailCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillSummary;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const tc = typeColor(skill.type);
  const SourceIcon = Icon[SOURCE_ICON[skill.source] ?? "Edit"];
  return (
    <>
      {/* Rendered OUTSIDE the role="button" card: nested interactive controls
          inside it are unreachable by keyboard, because the card's own Enter /
          Space handler cancels their default activation. */}
      {confirming && (
        <ConfirmDialog
          title={t("card.deleteTitle", { name: skill.name })}
          body={t("card.deleteBody", { count: skill.used_by })}
          confirmLabel={t("card.delete")}
          cancelLabel={t("card.deleteCancel")}
          loading={del.isPending}
          onConfirm={() =>
            del.mutate(skill.id, { onSuccess: () => setConfirming(false) })
          }
          onCancel={() => setConfirming(false)}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={skill.name}
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          // Only when the card itself is focused. Without this guard the handler
          // also fires for keydowns bubbling from the delete button / toggle and
          // preventDefault() cancels THEIR activation, making them keyboard-dead.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        title={skill.enabled ? undefined : t("card.disabledTitle")}
        style={s.card(!!active, skill.enabled)}
      >
        <div style={s.headerRow}>
          <div style={s.iconBox(tc.color, tc.bg)}>
            <Icon.Sparkles size={14} />
          </div>
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
          <Badge color="var(--text-muted)" mono>
            {t("editor.version", { version: skill.version })}
          </Badge>
          {onToggle && (
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle on={skill.enabled} onChange={onToggle} size={14} />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            title={t("card.delete")}
            aria-label={t("card.delete")}
            style={s.deleteBtn}
          >
            <Icon.Trash size={13} />
          </button>
        </div>
        <div style={s.description}>
          {skill.description || t("card.noDescription")}
        </div>
        <div style={s.metaRow}>
          <Badge color={tc.color} bg={tc.bg}>
            {t(`card.type.${skill.type}`)}
          </Badge>
          <span style={s.source}>
            <SourceIcon size={12} />
            {t(`card.source.${skill.source}`)}
          </span>
        </div>
        <div style={s.divider} />
        <div style={s.statsRow}>
          <span>{t("rail.stats.agents", { count: skill.used_by })}</span>
          <span>
            {skill.pull_pct == null
              ? t("rail.stats.unknownPull")
              : t("rail.stats.pull", { pct: skill.pull_pct })}
          </span>
          <span style={s.accept(skill.accept_pct != null)}>
            {skill.accept_pct == null
              ? t("rail.stats.unknownAccept")
              : t("rail.stats.accept", { pct: skill.accept_pct })}
          </span>
        </div>
      </div>
    </>
  );
}
