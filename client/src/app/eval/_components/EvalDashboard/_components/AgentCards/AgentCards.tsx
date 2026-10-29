/* AgentCards — one card per workspace agent: name, model, its last finished
   run (version, date, passed/scored) and recall / precision / citation, or
   "No runs yet". The whole card links to the agent's Evals tab. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalDashboardOverview } from "@devdigest/shared";
import { formatPct, formatWhen } from "@/lib/eval-format";
import { s } from "./styles";

export function AgentCards({ agents }: { agents: EvalDashboardOverview["agents"] }) {
  const t = useTranslations("eval");

  return (
    <div style={s.grid}>
      {agents.map((a) => {
        const run = a.last_run;
        const metric = (label: string, value: number | null | undefined) => (
          <div style={s.metric}>
            <span style={s.metricLabel}>{label}</span>
            <span style={s.metricValue}>{formatPct(value)}</span>
          </div>
        );
        return (
          <Link key={a.agent_id} href={`/agents/${a.agent_id}?tab=evals`} style={s.card} data-testid="agent-card">
            <div style={s.head}>
              <span style={s.name}>{a.name}</span>
              {!a.enabled && (
                <Badge color="var(--text-muted)" dot>
                  {t("evalDashboard.disabled")}
                </Badge>
              )}
            </div>
            <span style={s.model}>{a.model}</span>
            <span style={s.muted}>{t("evalDashboard.casesTotal", { count: a.cases_total })}</span>
            {run ? (
              <>
                <span style={s.muted}>
                  {t("evalDashboard.lastRun", {
                    version: run.config.agent_version,
                    ranAt: formatWhen(run.started_at),
                    passed: run.counts?.cases_passed ?? 0,
                    scored: run.counts?.cases_scored ?? 0,
                  })}
                </span>
                <div style={s.metrics}>
                  {metric(t("dashboard.metrics.recall"), run.metrics?.recall)}
                  {metric(t("dashboard.metrics.precision"), run.metrics?.precision)}
                  {metric(t("dashboard.metrics.citationAccuracy"), run.metrics?.citation_accuracy)}
                </div>
              </>
            ) : (
              <span style={s.muted}>{t("evalDashboard.noRunsYet")}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
