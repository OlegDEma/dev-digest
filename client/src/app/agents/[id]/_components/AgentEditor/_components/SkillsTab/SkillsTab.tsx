/* SkillsTab — bind workspace skills to this agent and order them. Every row is
   a skill; the checkbox binds it (bound skills go into the prompt, in this
   order), drag / ↑↓ reorder the bound ones. Each change persists the whole
   ordered set at once (POST /agents/:id/skills { skill_ids }). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { DRAG_MIME, TYPE_COLOR } from "./constants";
import { buildRows, filterRows, moveBound, toggleBound } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const router = useRouter();
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [search, setSearch] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  const rows = React.useMemo(() => buildRows(skillsQ.data ?? [], linksQ.data ?? []), [skillsQ.data, linksQ.data]);
  const boundIds = rows.filter((r) => r.bound).map((r) => r.skill.id);
  const visible = filterRows(rows, search);
  const busy = setSkills.isPending;

  const persist = (skillIds: string[]) =>
    setSkills.mutate(
      { agentId: agent.id, skillIds },
      { onSuccess: (links) => toast.success(t("skills.savedToast", { count: links.length })) },
    );

  const onToggle = (skillId: string, bound: boolean) => persist(toggleBound(boundIds, skillId, bound));
  const onMove = (from: number, to: number) => {
    const next = moveBound(boundIds, from, to);
    if (next !== boundIds) persist(next);
  };
  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  if (skillsQ.isLoading || linksQ.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <div style={{ height: 12 }} />
        <Skeleton height={44} />
        <div style={{ height: 8 }} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: boundIds.length, total: rows.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {rows.length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title={t("skills.emptyTitle")}
          body={t("skills.emptyBody")}
          cta={t("skills.emptyCta")}
          onCta={() => router.push("/skills")}
        />
      ) : visible.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatch")}</div>
      ) : (
        <div style={s.list} role="list">
          {visible.map((row) => {
            const boundIndex = row.bound ? boundIds.indexOf(row.skill.id) : -1;
            const tc = TYPE_COLOR[row.skill.type] ?? TYPE_COLOR.custom!;
            // Drag is only meaningful for rows that actually reach the prompt:
            // bound AND globally enabled (a disabled skill is skipped at run
            // time, so its position is meaningless), and only when unfiltered —
            // a filtered list hides the neighbours being reordered.
            const draggable = row.bound && row.skill.enabled && !busy && search.trim() === "";
            return (
              <div
                key={row.skill.id}
                role="listitem"
                data-skill-id={row.skill.id}
                data-bound={row.bound}
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable) return;
                  e.dataTransfer.setData(DRAG_MIME, String(boundIndex));
                  e.dataTransfer.effectAllowed = "move";
                  setDragIndex(boundIndex);
                }}
                onDragOver={(e) => {
                  if (dragIndex === null || !row.bound) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== boundIndex) setOverIndex(boundIndex);
                }}
                onDragLeave={() => {
                  if (overIndex === boundIndex) setOverIndex(null);
                }}
                onDrop={(e) => {
                  if (dragIndex === null || !row.bound) return;
                  e.preventDefault();
                  onMove(dragIndex, boundIndex);
                  endDrag();
                }}
                onDragEnd={endDrag}
                style={s.row(row.bound, row.skill.enabled, dragIndex === boundIndex && row.bound, overIndex === boundIndex && row.bound)}
              >
                <span style={s.handle(draggable)} title={draggable ? t("skills.dragHandle") : undefined} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
                <BindCheckbox
                  checked={row.bound}
                  disabled={busy}
                  label={t("skills.bind", { name: row.skill.name })}
                  onChange={(v) => onToggle(row.skill.id, v)}
                />
                <div style={s.text}>
                  <span className="mono" style={s.name}>
                    {row.skill.name}
                  </span>
                  {row.skill.description && <span style={s.description}>{row.skill.description}</span>}
                </div>
                {!row.skill.enabled && (
                  <Badge color="var(--text-muted)" dot style={{ cursor: "help" }}>
                    <span title={t("skills.disabledTitle")}>{t("skills.disabledBadge")}</span>
                  </Badge>
                )}
                <Badge color={tc.color} bg={tc.bg}>
                  {row.skill.type}
                </Badge>
                {row.bound && (
                  <span style={s.arrows}>
                    <button
                      type="button"
                      aria-label={t("skills.moveUp")}
                      title={t("skills.moveUp")}
                      disabled={busy || boundIndex === 0}
                      onClick={() => onMove(boundIndex, boundIndex - 1)}
                      style={s.arrowBtn(busy || boundIndex === 0)}
                    >
                      <Icon.ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("skills.moveDown")}
                      title={t("skills.moveDown")}
                      disabled={busy || boundIndex === boundIds.length - 1}
                      onClick={() => onMove(boundIndex, boundIndex + 1)}
                      style={s.arrowBtn(busy || boundIndex === boundIds.length - 1)}
                    >
                      <Icon.ArrowDown size={12} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The bind toggle. Same look as the kit's `Checkbox`, but with an accessible
 * name on the control itself — the kit's version only takes a visual label,
 * and a `<label>` does not name a `<button>` the way it names an `<input>`.
 */
function BindCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={s.checkbox(checked, !!disabled)}
    >
      {checked && <Icon.Check size={11} style={{ color: "#fff" }} />}
    </button>
  );
}
