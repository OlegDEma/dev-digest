/* /eval — Eval Dashboard: one row per agent (newest full run, sparkline), the 20
   most recent full runs across agents and "Run all agents". Only the batch
   dialog starts LLM work, after an explicit confirmation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useWatchEvalRuns } from "@/lib/hooks/eval-dashboards";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { AgentRows } from "./_components/AgentRows";
import { RecentRuns } from "./_components/RecentRuns";
import { RunAllAgentsDialog } from "./_components/RunAllAgentsDialog";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval");
  const td = useTranslations("evalDashboard");
  const q = useEvalDashboard();
  const [runAllOpen, setRunAllOpen] = React.useState(false);
  const [watched, setWatched] = React.useState<string[]>([]);
  const stillRunning = useWatchEvalRuns(watched);

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.head}>
          <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
          {q.data && q.data.agents.length > 0 && (
            <Button kind="primary" icon="Play" onClick={() => setRunAllOpen(true)}>
              {td("rows.runAll")}
            </Button>
          )}
        </div>
        {stillRunning > 0 && (
          <div role="status" style={s.running}>
            {td("rows.batchRunning", { count: stillRunning })}
          </div>
        )}
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
            <AgentRows agents={q.data.agents} />
            <RecentRuns runs={q.data.recent_runs} />
          </>
        )}
        {runAllOpen && q.data && <RunAllAgentsDialog agents={q.data.agents} onClose={() => setRunAllOpen(false)} onStarted={setWatched} />}
      </div>
    </AppShell>
  );
}
