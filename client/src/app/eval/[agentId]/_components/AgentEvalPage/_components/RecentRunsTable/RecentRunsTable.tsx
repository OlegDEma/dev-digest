/* RecentRunsTable — the agent's newest 50 runs in range (both scopes): ran-at,
   version (+ "1 case" for a single-case run), metric bars with value text, PASS,
   COST and status. Each row has a checkbox named "Select run <ran at>"; Compare is
   enabled only with exactly two finished full-set runs selected. Selection is owned
   by the page so it survives the compare view closing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { EvalRunSummary } from "@devdigest/shared";
import { MetricBar } from "@/components/eval-metric-bar";
import { configChanged, formatCost, formatWhen, isFinished, passText } from "@/lib/eval-format";
import { s } from "./styles";

/** Newest runs listed (AC-D66). */
export const RECENT_RUNS_LIMIT = 50;

/** The runs the table shows: newest first, capped. */
export function visibleRuns(runs: EvalRunSummary[]): EvalRunSummary[] {
  return [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, RECENT_RUNS_LIMIT);
}

export function RecentRunsTable({
  runs,
  selected,
  onToggle,
  onCompare,
}: {
  runs: EvalRunSummary[];
  selected: readonly string[];
  onToggle: (runId: string) => void;
  onCompare: () => void;
}) {
  const t = useTranslations("evalDashboard");
  const rows = React.useMemo(() => visibleRuns(runs), [runs]);
  const selectedRuns = rows.filter((r) => selected.includes(r.id));
  const canCompare =
    selected.length === 2 && selectedRuns.length === 2 && selectedRuns.every((r) => isFinished(r) && r.scope === "all");

  return (
    <section>
      <div style={s.header}>
        <h2 style={s.h2}>{t("agentPage.recentHeading")}</h2>
        <span style={s.count}>{t("agentPage.selected", { count: selected.length })}</span>
        <Button kind="secondary" size="sm" disabled={!canCompare} onClick={onCompare}>
          {t("agentPage.compare")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div style={s.empty}>{t("agentPage.noRecent")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              {(["colRanAt", "colVersion", "colRecall", "colPrecision", "colCitation", "colPass", "colCost", "colStatus"] as const).map((k) => (
                <th key={k} style={s.th}>
                  {t(`agentPage.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const when = formatWhen(r.started_at);
              const label = t("agentPage.selectRun", { ranAt: when });
              const checked = selected.includes(r.id);
              return (
                <tr key={r.id} data-testid="agent-run-row">
                  <td style={s.td}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={label}
                      title={label}
                      onClick={() => onToggle(r.id)}
                      style={s.checkbox(checked)}
                    />
                  </td>
                  <td style={s.td}>{when}</td>
                  <td style={s.td}>
                    v{r.config.agent_version}
                    {r.scope === "case" && <span style={s.scope}> · {t("agentPage.oneCase")}</span>}{" "}
                    {configChanged(r, rows[i + 1]) && (
                      <Badge color="var(--warn)" dot>
                        {t("agentPage.configChanged")}
                      </Badge>
                    )}
                  </td>
                  <td style={s.td}>
                    <MetricBar value={r.metrics?.recall} />
                  </td>
                  <td style={s.td}>
                    <MetricBar value={r.metrics?.precision} />
                  </td>
                  <td style={s.td}>
                    <MetricBar value={r.metrics?.citation_accuracy} />
                  </td>
                  <td style={s.td}>{passText(r)}</td>
                  <td style={s.td}>{formatCost(r.cost_usd)}</td>
                  <td style={s.td}>
                    {t(`status.${r.status}`)}
                    {r.status === "failed" && r.error && <div style={s.reason}>{r.error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
