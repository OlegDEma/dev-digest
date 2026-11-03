/* AgentRows — one row per workspace agent: name, model chip, its newest full run
   ("Last run v… · date · p/s pass"), a recall sparkline (hidden under two full
   runs), R/P/C and a chevron. The whole row opens the agent's eval page. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon, Sparkline } from "@devdigest/ui";
import type { EvalDashboardOverview } from "@devdigest/shared";
import { formatPct, formatWhen } from "@/lib/eval-format";
import { s } from "./styles";

export function AgentRows({ agents }: { agents: EvalDashboardOverview["agents"] }) {
  const t = useTranslations("evalDashboard");
  const te = useTranslations("eval");

  return (
    <div style={s.list}>
      {agents.map((a) => {
        const run = a.last_full_run;
        const metric = (short: string, label: string, value: number | null | undefined) => (
          <span style={s.metric} title={label}>
            <span style={s.metricLabel}>{short}</span>
            <span className="tnum" style={s.metricValue}>
              {formatPct(value)}
            </span>
          </span>
        );
        return (
          <Link key={a.agent_id} href={`/eval/${a.agent_id}`} style={s.row} data-testid="agent-row">
            <span style={s.nameCol}>
              <span style={s.name}>{a.name}</span>
              <span style={s.chip}>{a.model}</span>
              {!a.enabled && (
                <Badge color="var(--text-muted)" dot>
                  {te("evalDashboard.disabled")}
                </Badge>
              )}
            </span>
            <span style={s.last}>
              {run
                ? t("rows.lastRun", {
                    version: run.config.agent_version,
                    ranAt: formatWhen(run.started_at),
                    passed: run.counts?.cases_passed ?? 0,
                    scored: run.counts?.cases_scored ?? 0,
                  })
                : t("rows.noRuns")}
            </span>
            <span style={s.spark} role={a.sparkline.length >= 2 ? "img" : undefined} aria-label={a.sparkline.length >= 2 ? t("rows.trend", { count: a.sparkline.length }) : undefined}>
              {a.sparkline.length >= 2 && <Sparkline data={a.sparkline} w={80} h={24} />}
            </span>
            <span style={s.metrics}>
              {metric(t("rows.recallShort"), te("dashboard.metrics.recall"), run?.metrics?.recall)}
              {metric(t("rows.precisionShort"), te("dashboard.metrics.precision"), run?.metrics?.precision)}
              {metric(t("rows.citationShort"), te("dashboard.metrics.citationAccuracy"), run?.metrics?.citation_accuracy)}
            </span>
            <Icon.ChevronRight size={14} aria-hidden style={s.chevron} />
          </Link>
        );
      })}
    </div>
  );
}
