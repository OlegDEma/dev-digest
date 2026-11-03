/* TrendChart — METRIC TREND: recall / precision / citation of the full runs in
   range as three lines (inline SVG; an unknown metric leaves a gap instead of
   a zero), a legend, and a visually hidden text alternative listing every point.
   Under two runs it says there is not enough data for a trend. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalMetricName, EvalSeriesPoint } from "@devdigest/shared";
import { formatPct, formatWhen } from "@/lib/eval-format";
import { buildSegments } from "./helpers";
import { s } from "./styles";

const W = 620;
const H = 180;
const PAD = { l: 34, r: 12, t: 10, b: 10 };

const LINES: { key: EvalMetricName; legend: "legendRecall" | "legendPrecision" | "legendCitation"; color: string }[] = [
  { key: "recall", legend: "legendRecall", color: "var(--accent)" },
  { key: "precision", legend: "legendPrecision", color: "var(--ok)" },
  { key: "citation_accuracy", legend: "legendCitation", color: "var(--warn)" },
];

export function TrendChart({ series }: { series: EvalSeriesPoint[] }) {
  const t = useTranslations("evalDashboard");
  if (series.length < 2) return <div style={s.empty}>{t("agentPage.notEnoughRuns")}</div>;

  const alt = t("agentPage.trendAlt", {
    count: series.length,
    points: series
      .map((p) =>
        t("agentPage.trendPoint", {
          version: p.agent_version,
          ranAt: formatWhen(p.ran_at),
          recall: formatPct(p.recall),
          precision: formatPct(p.precision),
          citation: formatPct(p.citation_accuracy),
        }),
      )
      .join(" "),
  });

  return (
    <figure style={s.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} style={s.svg} role="img" aria-label={alt}>
        {[0, 0.5, 1].map((g) => {
          const y = PAD.t + (1 - g) * (H - PAD.t - PAD.b);
          return (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--border)" />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {Math.round(g * 100)}%
              </text>
            </g>
          );
        })}
        {LINES.map((l) => (
          <g key={l.key}>
            {buildSegments(series.map((p) => p[l.key]), W, H, PAD).map((d, i) => (
              <path key={i} d={d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </g>
        ))}
      </svg>
      <figcaption style={s.legend}>
        {LINES.map((l) => (
          <span key={l.key} style={s.legendItem}>
            <span style={s.swatch(l.color)} aria-hidden />
            {t(`agentPage.${l.legend}`)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
