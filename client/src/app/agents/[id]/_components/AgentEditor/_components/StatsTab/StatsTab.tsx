/* StatsTab — the agent's rolling 30-day numbers from `GET /agents/:id/stats`:
   Runs · Accept % · Dismiss % · Avg cost · Avg latency · Findings by severity.
   A ratio or mean without a denominator is "—", never 0. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentStats } from "../../../../../../../lib/hooks/agent-stats";
import { formatCost } from "../../../../../../../lib/eval-format";
import { latencyText, percentValue } from "./helpers";
import { s } from "./styles";

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading, isError, refetch } = useAgentStats(agent.id);

  if (isError) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  if (isLoading || !stats) {
    return (
      <div style={s.wrap} aria-busy="true">
        <div style={s.tiles}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={110} />
          ))}
        </div>
      </div>
    );
  }

  const accept = percentValue(stats.accept_rate);
  const dismiss = percentValue(stats.dismiss_rate);
  const sev = stats.findings_by_severity;
  return (
    <div style={s.wrap}>
      <div style={s.window}>{t("stats.window")}</div>
      <div style={s.tiles}>
        <Tile label={t("stats.runs")} value={String(stats.runs)} />
        <Tile label={t("stats.accept")} value={accept == null ? null : String(accept)} unit={t("stats.percent")} />
        <Tile label={t("stats.dismiss")} value={dismiss == null ? null : String(dismiss)} unit={t("stats.percent")} />
        <Tile label={t("stats.cost")} value={stats.avg_cost_usd == null ? null : formatCost(stats.avg_cost_usd)} />
        <Tile label={t("stats.latency")} value={latencyText(stats.avg_latency_ms)} />
        <div style={s.tile}>
          <span style={s.tileLabel}>{t("stats.severity")}</span>
          <div style={s.severityRow}>
            <Severity label={t("stats.critical")} value={sev.CRITICAL} />
            <Severity label={t("stats.warning")} value={sev.WARNING} />
            <Severity label={t("stats.suggestion")} value={sev.SUGGESTION} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One KPI tile. `value` null → "—" (no denominator). */
function Tile({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  const t = useTranslations("agents");
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>{label}</span>
      <div style={s.tileValueRow}>
        <span className="tnum" style={s.tileValue} data-testid={`stat-${label}`}>
          {value ?? t("stats.unknown")}
        </span>
        {value != null && unit && <span style={s.tileUnit}>{unit}</span>}
      </div>
    </div>
  );
}

function Severity({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.severityItem}>
      <span className="tnum" style={s.severityValue}>
        {value}
      </span>
      <span style={s.severityLabel}>{label}</span>
    </div>
  );
}
