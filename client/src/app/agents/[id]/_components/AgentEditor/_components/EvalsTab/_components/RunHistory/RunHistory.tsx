/* RunHistory — the agent's newest 50 eval runs. Each row has a checkbox named
   "Select run <ran at>"; "Compare" is enabled only with exactly two finished
   runs selected. Selection is owned by the parent so it survives the compare
   view closing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalRunStatus } from "@devdigest/shared";
import { useAgentEvalRuns } from "@/lib/hooks/evals";
import { configChanged, formatCost, formatPct, formatWhen, isFinished, passText } from "@/lib/eval-format";
import { s } from "./styles";

/** Newest runs listed (AC-46a). */
export const HISTORY_LIMIT = 50;

const STATUS_KEY: Record<EvalRunStatus, string> = {
  running: "statusRunning",
  done: "statusDone",
  partial: "statusPartial",
  failed: "statusFailed",
};

export function RunHistory({
  agentId,
  selected,
  onToggle,
  onCompare,
}: {
  agentId: string;
  selected: readonly string[];
  onToggle: (runId: string) => void;
  onCompare: () => void;
}) {
  const t = useTranslations("eval");
  const runsQ = useAgentEvalRuns(agentId);

  const runs = React.useMemo(
    () => [...(runsQ.data ?? [])].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, HISTORY_LIMIT),
    [runsQ.data],
  );

  if (runsQ.isLoading) {
    return (
      <div style={s.wrap} data-testid="history-skeleton" aria-busy="true">
        <Skeleton height={32} />
        <div style={{ height: 8 }} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (runsQ.isError && !runsQ.data) {
    return <ErrorState body={t("evalsTab.loadError")} onRetry={() => void runsQ.refetch()} />;
  }

  const selectedRuns = runs.filter((r) => selected.includes(r.id));
  const canCompare = selected.length === 2 && selectedRuns.length === 2 && selectedRuns.every(isFinished);

  return (
    <section style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.runHistory")}</h2>
        <Button kind="secondary" size="sm" disabled={!canCompare} onClick={onCompare}>
          {t("evalsTab.compare")}
        </Button>
      </div>
      {runs.length === 0 ? (
        <div style={s.empty}>{t("dashboard.noRuns")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              <th style={s.th}>{t("dashboard.table.ranAt")}</th>
              <th style={s.th}>{t("evalsTab.version")}</th>
              <th style={s.th}>{t("dashboard.table.recall")}</th>
              <th style={s.th}>{t("dashboard.table.precision")}</th>
              <th style={s.th}>{t("dashboard.table.citation")}</th>
              <th style={s.th}>{t("dashboard.table.pass")}</th>
              <th style={s.th}>{t("dashboard.table.cost")}</th>
              <th style={s.th}>{t("evalsTab.status")}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const checked = selected.includes(r.id);
              const when = formatWhen(r.started_at);
              const label = t("evalsTab.selectRun", { ranAt: when });
              return (
                <tr key={r.id}>
                  <td style={s.td}>
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={label}
                      title={label}
                      onChange={() => onToggle(r.id)}
                    />
                  </td>
                  <td style={s.td}>{when}</td>
                  <td style={s.td}>
                    v{r.config.agent_version}{" "}
                    {configChanged(r, runs[i + 1]) && (
                      <Badge color="var(--warn)" dot>
                        {t("evalsTab.configChanged")}
                      </Badge>
                    )}
                  </td>
                  <td style={s.td}>{formatPct(r.metrics?.recall)}</td>
                  <td style={s.td}>{formatPct(r.metrics?.precision)}</td>
                  <td style={s.td}>{formatPct(r.metrics?.citation_accuracy)}</td>
                  <td style={s.td}>{passText(r)}</td>
                  <td style={s.td}>{formatCost(r.cost_usd)}</td>
                  <td style={s.td}>
                    {t(`evalsTab.${STATUS_KEY[r.status]}`)}
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
