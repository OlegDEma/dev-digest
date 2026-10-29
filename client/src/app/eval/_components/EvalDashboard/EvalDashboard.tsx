/* /eval — Eval Dashboard: one card per agent (last finished run) and the 20
   most recent eval runs across agents. Read-only; makes no LLM calls. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { AgentCards } from "./_components/AgentCards";
import { RecentRuns } from "./_components/RecentRuns";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval");
  const q = useEvalDashboard();

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
        {q.isLoading ? (
          <div style={s.skeletons} data-testid="dashboard-skeleton" aria-busy="true">
            <Skeleton height={130} />
            <Skeleton height={130} />
            <Skeleton height={130} />
          </div>
        ) : q.isError || !q.data ? (
          <ErrorState body={t("evalDashboard.loadError")} onRetry={() => void q.refetch()} />
        ) : q.data.agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("evalDashboard.noAgents")} body={t("evalDashboard.noAgentsBody")} />
        ) : (
          <>
            <AgentCards agents={q.data.agents} />
            <RecentRuns runs={q.data.recent_runs} />
          </>
        )}
      </div>
    </AppShell>
  );
}
