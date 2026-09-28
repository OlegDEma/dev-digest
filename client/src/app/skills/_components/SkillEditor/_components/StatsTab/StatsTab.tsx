/* StatsTab — real 30-day numbers from `GET /skills/:id/stats` (attributed via
   agent_run_skills): USED BY · PULL FREQUENCY · ACCEPT RATE (ring) · FINDINGS
   (30D), plus the agents that bind the skill. A rate without a denominator is
   "—", never 0. "Findings by category" is deliberately not here (spec §10 D12). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircularScore, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isError) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <div style={s.tiles}>
          <Skeleton height={132} />
          <Skeleton height={132} />
          <Skeleton height={132} />
          <Skeleton height={132} />
        </div>
        <Skeleton height={200} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")} value={stats.used_by} unit={t("stats.agentsUnit", { count: stats.used_by })} />
        <Tile
          label={t("stats.pull")}
          value={stats.pull_pct}
          unit={t("stats.percent")}
          note={stats.pull_pct == null ? t("stats.noRuns") : undefined}
          title={t("stats.pullHint")}
        />
        <Tile
          label={t("stats.accept")}
          value={stats.accept_pct}
          unit={t("stats.percent")}
          note={stats.accept_pct == null ? t("stats.noActions") : undefined}
          title={t("stats.acceptHint")}
          ring={stats.accept_pct}
        />
        <Tile label={t("stats.findings")} value={stats.findings_30d} title={t("stats.findingsHint")} />
      </div>

      <div style={s.cards}>
        <div style={s.card}>
          <div style={s.cardHead}>
            <Icon.Cpu size={13} />
            {t("stats.agentsUsing")}
          </div>
          {stats.agents.length === 0 ? (
            <div style={s.none}>{t("stats.noAgents")}</div>
          ) : (
            stats.agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}?tab=skills`} style={s.agentRow}>
                <span style={s.agentIcon}>
                  <Icon.Cpu size={14} />
                </span>
                <span style={s.agentName}>{a.name}</span>
                <span className="mono" style={s.open}>
                  {t("stats.open")}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** One KPI tile. `value` null → "—" (no denominator); `ring` draws the accept-rate gauge. */
function Tile({
  label,
  value,
  unit,
  note,
  title,
  ring,
}: {
  label: string;
  value: number | null;
  unit?: string;
  note?: string;
  title?: string;
  ring?: number | null;
}) {
  const t = useTranslations("skills");
  const unknown = value == null;
  return (
    <div style={s.tile} title={title}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {ring != null && <CircularScore score={ring} size={44} />}
      </div>
      <div>
        <div style={s.tileValueRow}>
          <span className="tnum" style={s.tileValue} data-testid={`stat-${label}`}>
            {unknown ? t("stats.unknown") : value}
          </span>
          {!unknown && unit && <span style={s.tileUnit}>{unit}</span>}
        </div>
        {note && <div style={s.tileNote}>{note}</div>}
      </div>
    </div>
  );
}
