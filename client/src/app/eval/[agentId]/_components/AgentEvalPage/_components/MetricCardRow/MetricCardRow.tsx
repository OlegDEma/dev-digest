/* MetricCardRow — RECALL / PRECISION / CITATION of the newest full run in range:
   big value, a sparkline of the range (hidden under two points) and the change vs
   the previous full run written as "▲/▼/± n pt". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { AgentEvalDashboard, EvalMetricName } from "@devdigest/shared";
import { BAND_COLOR, formatDelta, formatPct, metricBand } from "@/lib/eval-format";
import { s } from "./styles";

const METRICS: { key: EvalMetricName; label: "recall" | "precision" | "citation" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citation" },
];

export function MetricCardRow({ data }: { data: AgentEvalDashboard }) {
  const t = useTranslations("evalDashboard");
  return (
    <div style={s.row}>
      {METRICS.map(({ key, label }) => {
        const value = data.latest?.metrics?.[key] ?? null;
        const prev = data.previous?.metrics?.[key] ?? null;
        const trend = data.series.map((p) => p[key]).filter((v): v is number => v != null);
        return (
          <div key={key} style={s.card} data-testid={`metric-${key}`}>
            <div style={s.top}>
              <span style={s.label}>{t(`agentPage.${label}`)}</span>
              {trend.length >= 2 && <Sparkline data={trend} w={56} h={20} color={value != null ? BAND_COLOR[metricBand(value)] : undefined} />}
            </div>
            <div style={s.bottom}>
              <span className="tnum" style={s.value}>
                {formatPct(value)}
              </span>
              <span style={s.delta}>{formatDelta(value, prev)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
