/* CiRunsTable — /ci-runs: the newest ingested CI runs with a Refresh button that
   reads result artifacts from GitHub. Every cell comes from the server and is
   rendered as plain text; the "View" link only accepts http(s) URLs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { RUN_LIMIT, STATUS_KEY, formatCost, formatRanAt, safeHref } from "./helpers";
import { s } from "./styles";

export function CiRunsTable() {
  const t = useTranslations("ci");
  const runsQ = useCiRuns();
  const refresh = useRefreshCiRuns();
  const rows = (runsQ.data ?? []).slice(0, RUN_LIMIT);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.titles}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <div style={s.subtitle}>{t("runs.subtitle")}</div>
          </div>
          <Button kind="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        {refresh.isError && (
          <div role="alert" style={s.error}>
            {refresh.error.message}
          </div>
        )}
        {refresh.data && refresh.data.skipped > 0 && (
          <div role="status" style={s.note}>
            {t("runs.skipped", { count: refresh.data.skipped })}
          </div>
        )}

        {runsQ.isLoading ? (
          <Skeleton height={120} />
        ) : runsQ.isError ? (
          <ErrorState body={t("runs.loadError")} onRetry={() => void runsQ.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t("runs.table.timestamp")}</th>
                <th style={s.th}>{t("runs.table.pullRequest")}</th>
                <th style={s.th}>{t("runs.table.source")}</th>
                <th style={s.th}>{t("runs.table.findings")}</th>
                <th style={s.th}>{t("runs.table.cost")}</th>
                <th style={s.th}>{t("runs.table.status")}</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = safeHref(r.github_url);
                const statusKey = r.status ? STATUS_KEY[r.status] : undefined;
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{formatRanAt(r.ran_at)}</td>
                    <td style={s.td}>{r.pr_number == null ? "—" : `#${r.pr_number}`}</td>
                    <td style={s.td}>{r.source ?? "—"}</td>
                    <td style={s.td}>{r.findings_count ?? "—"}</td>
                    <td style={s.td}>{formatCost(r.cost_usd)}</td>
                    <td style={s.td}>{statusKey ? t(`runs.status.${statusKey}`) : (r.status ?? "—")}</td>
                    <td style={s.td}>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" style={s.link}>
                          {t("runs.view")}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
