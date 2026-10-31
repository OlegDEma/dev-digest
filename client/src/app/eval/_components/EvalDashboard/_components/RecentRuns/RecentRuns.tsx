/* RecentRuns — "Recent eval runs · all agents": the 20 newest finished full-set
   runs with recall / precision / citation as bars with value text. A row (or its
   agent link) opens that agent's eval page. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EvalRunSummary } from "@devdigest/shared";
import { MetricBar } from "@/components/eval-metric-bar";
import { formatWhen, passText } from "@/lib/eval-format";
import { s } from "./styles";

/** Rows shown (AC-57). */
export const RECENT_LIMIT = 20;

export function RecentRuns({ runs }: { runs: EvalRunSummary[] }) {
  const t = useTranslations("eval");
  const td = useTranslations("evalDashboard");
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
              const href = `/eval/${r.agent_id}`;
              return (
                <tr key={r.id} style={s.tr} onClick={() => router.push(href)} data-testid="recent-run-row">
                  <td style={s.td}>
                    <Link href={href} style={s.link} onClick={(e) => e.stopPropagation()}>
                      {r.agent_name}
                    </Link>
                  </td>
                  <td style={s.td}>{formatWhen(r.started_at)}</td>
                  <td style={s.td}>v{r.config.agent_version}</td>
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
                  <td style={s.td}>{td(`status.${r.status}`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
