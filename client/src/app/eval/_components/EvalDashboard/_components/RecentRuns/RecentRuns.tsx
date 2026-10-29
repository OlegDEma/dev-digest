/* RecentRuns — "Recent eval runs · all agents": the 20 newest eval runs. A row
   (or its agent link) opens that agent's Evals tab. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EvalRunStatus, EvalRunSummary } from "@devdigest/shared";
import { formatPct, formatWhen, passText } from "@/lib/eval-format";
import { s } from "./styles";

/** Rows shown (AC-57). */
export const RECENT_LIMIT = 20;

const STATUS_KEY: Record<EvalRunStatus, string> = {
  running: "statusRunning",
  done: "statusDone",
  partial: "statusPartial",
  failed: "statusFailed",
};

export function RecentRuns({ runs }: { runs: EvalRunSummary[] }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const rows = [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, RECENT_LIMIT);

  return (
    <section>
      <h2 style={s.h2}>{t("evalDashboard.recentHeading")}</h2>
      {rows.length === 0 ? (
        <div style={s.empty}>{t("evalDashboard.noRecentRuns")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("evalDashboard.agent")}</th>
              <th style={s.th}>{t("dashboard.table.ranAt")}</th>
              <th style={s.th}>{t("evalDashboard.version")}</th>
              <th style={s.th}>{t("dashboard.table.recall")}</th>
              <th style={s.th}>{t("dashboard.table.precision")}</th>
              <th style={s.th}>{t("dashboard.table.citation")}</th>
              <th style={s.th}>{t("dashboard.table.pass")}</th>
              <th style={s.th}>{t("evalDashboard.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = `/agents/${r.agent_id}?tab=evals`;
              return (
                <tr key={r.id} style={s.tr} onClick={() => router.push(href)} data-testid="recent-run-row">
                  <td style={s.td}>
                    <Link href={href} style={s.link} onClick={(e) => e.stopPropagation()}>
                      {r.agent_name}
                    </Link>
                  </td>
                  <td style={s.td}>{formatWhen(r.started_at)}</td>
                  <td style={s.td}>v{r.config.agent_version}</td>
                  <td style={s.td}>{formatPct(r.metrics?.recall)}</td>
                  <td style={s.td}>{formatPct(r.metrics?.precision)}</td>
                  <td style={s.td}>{formatPct(r.metrics?.citation_accuracy)}</td>
                  <td style={s.td}>{passText(r)}</td>
                  <td style={s.td}>{t(`evalsTab.${STATUS_KEY[r.status]}`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
