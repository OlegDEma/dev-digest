/* MetricCards — RECALL / PRECISION / CITATION ACCURACY / CASES PASSED from the
   agent's latest finished run, with the whole-point change vs the previous
   finished run written as text (▲ / ▼ / ±). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalMetrics } from "@devdigest/shared";
import { useAgentEvalRuns } from "@/lib/hooks/evals";
import { formatDelta, formatPct, isFinished, passText } from "@/lib/eval-format";
import { s } from "./styles";

type RatioKey = "recall" | "precision" | "citation_accuracy";

export function MetricCards({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const runsQ = useAgentEvalRuns(agentId);

  const finished = React.useMemo(
    () =>
      (runsQ.data ?? [])
        .filter(isFinished)
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)),
    [runsQ.data],
  );

  if (runsQ.isLoading) {
    return (
      <div style={s.skeletons} data-testid="metrics-skeleton" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} />
        ))}
      </div>
    );
  }
  if (runsQ.isError && !runsQ.data) {
    return <ErrorState body={t("evalsTab.loadError")} onRetry={() => void runsQ.refetch()} />;
  }

  const latest = finished[0];
  const prev = finished[1];
  const m: EvalMetrics | null = latest?.metrics ?? null;
  const pm: EvalMetrics | null = prev?.metrics ?? null;

  const ratio = (key: RatioKey, label: string, secondary: React.ReactNode[]) => (
    <div style={s.card} data-testid={`metric-${key}`}>
      <div style={s.label}>{label}</div>
      <div style={s.value}>{formatPct(m?.[key])}</div>
      {m && pm && formatDelta(m[key], pm[key]) && <div style={s.delta}>{formatDelta(m[key], pm[key])}</div>}
      {latest && secondary.map((line, i) => <div key={i} style={s.secondary}>{line}</div>)}
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.grid}>
        {ratio("recall", t("dashboard.metrics.recall"), [
          t("evalsTab.macro", { value: formatPct(m?.macro_recall) }),
        ])}
        {ratio("precision", t("dashboard.metrics.precision"), [
          t("evalsTab.strictPrecision", { value: formatPct(m?.strict_precision) }),
          t("evalsTab.unlabelled", { count: latest?.counts?.unlabelled ?? 0 }),
          t("evalsTab.macro", { value: formatPct(m?.macro_precision) }),
        ])}
        {ratio("citation_accuracy", t("dashboard.metrics.citationAccuracy"), [])}
        <div style={s.card} data-testid="metric-passed">
          <div style={s.label}>{t("evalsTab.casesPassed")}</div>
          <div style={s.value}>{latest ? passText(latest) : "—"}</div>
        </div>
      </div>
      {!latest && <div style={s.empty}>{t("evalsTab.noRunsYet")}</div>}
    </div>
  );
}
