/* AgentEvalPage — /eval/<agentId>: the agent's eval dashboard. Header (breadcrumb,
   All agents, agent selector, 7/30/90-day range kept in ?range=, Run eval), the
   regression banner, three metric cards, the metric trend, and the recent runs with
   Compare. Reads only finished full-set runs for cards/trend; Run eval is the one
   action that starts LLM work. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, SelectInput } from "@devdigest/ui";
import { EvalRange } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEvalDashboard } from "@/lib/hooks/eval-dashboards";
import { useStartEvalRun } from "@/lib/hooks/evals";
import { CompareModal } from "./_components/CompareModal";
import { MetricCardRow } from "./_components/MetricCardRow";
import { RecentRunsTable, visibleRuns } from "./_components/RecentRunsTable";
import { RegressionBanner } from "./_components/RegressionBanner";
import { TrendChart } from "./_components/TrendChart";
import { s } from "./styles";

const RANGES = EvalRange.options;
const DEFAULT_RANGE: EvalRange = "30d";

export function AgentEvalPage({ agentId }: { agentId: string }) {
  const t = useTranslations("evalDashboard");
  const router = useRouter();
  const params = useSearchParams();
  const parsed = EvalRange.safeParse(params.get("range"));
  const range: EvalRange = parsed.success ? parsed.data : DEFAULT_RANGE;

  const q = useAgentEvalDashboard(agentId, range);
  const agentsQ = useAgents();
  const startRun = useStartEvalRun(agentId, { silentError: true });
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  const query = (r: EvalRange) => (r === DEFAULT_RANGE ? "" : `?range=${r}`);
  // Selection only ever counts runs the table shows, so a range change cannot leave ghosts behind.
  const visibleIds = React.useMemo(() => new Set(visibleRuns(q.data?.runs ?? []).map((r) => r.id)), [q.data?.runs]);
  const picked = React.useMemo(() => selected.filter((id) => visibleIds.has(id)), [selected, visibleIds]);
  const toggle = (id: string) =>
    setSelected(() => (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]));

  const active = (q.data?.runs ?? []).find((r) => r.status === "running" || r.status === "queued");
  const busy = startRun.isPending || !!active;

  const onRun = () => {
    setStartError(null);
    startRun.mutate(undefined, {
      onError: (err) => setStartError(err.message),
    });
  };

  const name = q.data?.agent.name ?? "";
  const agentOptions = (agentsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }));

  return (
    <AppShell crumb={[{ label: t("agentPage.crumbDashboard"), href: "/eval" }, { label: name || agentId }]}>
      <div style={s.page}>
        <div style={s.head}>
          <Link href="/eval" style={s.back}>
            {t("agentPage.allAgents")}
          </Link>
          {agentOptions.length > 0 && (
            <label style={s.select}>
              <span style={s.srOnly}>{t("agentPage.agentSelect")}</span>
              <SelectInput
                mono={false}
                value={agentId}
                options={agentOptions}
                onChange={(id) => router.push(`/eval/${id}${query(range)}`)}
              />
            </label>
          )}
          <div role="group" aria-label={t("agentPage.range")} style={s.ranges}>
            {RANGES.map((r) => (
              <Button
                key={r}
                kind={r === range ? "primary" : "secondary"}
                size="sm"
                aria-pressed={r === range}
                onClick={() => router.replace(`/eval/${agentId}${query(r)}`)}
              >
                {t(`agentPage.range${r}`)}
              </Button>
            ))}
          </div>
          <Button kind="primary" icon="Play" disabled={busy} onClick={onRun}>
            {startRun.isPending ? t("agentPage.starting") : t("agentPage.runEval")}
          </Button>
        </div>

        {active && (
          <div role="status" style={s.progress}>
            {active.status === "queued"
              ? t("agentPage.runQueued")
              : t("agentPage.runProgress", { done: active.progress.done, total: active.progress.total })}
          </div>
        )}
        {startError && (
          <div role="alert" style={s.error}>
            {t("agentPage.startFailed", { message: startError })}
          </div>
        )}

        {q.isLoading ? (
          <div style={s.skeletons} data-testid="agent-eval-skeleton" aria-busy="true">
            <Skeleton height={90} />
            <Skeleton height={180} />
            <Skeleton height={140} />
          </div>
        ) : q.isError || !q.data ? (
          <ErrorState body={t("agentPage.loadError")} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <h1 style={s.h1}>{q.data.agent.name}</h1>
            <RegressionBanner regression={q.data.regression} />
            <MetricCardRow data={q.data} />
            <h2 style={s.h2}>{t("agentPage.trendHeading")}</h2>
            <TrendChart series={q.data.series} />
            <RecentRunsTable runs={q.data.runs} selected={picked} onToggle={toggle} onCompare={() => setComparing(true)} />
          </>
        )}
      </div>
      {comparing && picked.length === 2 && (
        <CompareModal agentId={agentId} runIds={[picked[0]!, picked[1]!]} onClose={() => setComparing(false)} />
      )}
    </AppShell>
  );
}
