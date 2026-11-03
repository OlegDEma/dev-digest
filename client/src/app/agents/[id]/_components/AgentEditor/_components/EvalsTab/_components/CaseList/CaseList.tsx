/* CaseList — the agent's eval cases. Each row: status icon (with a text
   alternative), the name in monospace (one line, full name on hover and to screen
   readers), the last result summary or "never run", a chip and the run / edit /
   delete buttons. The heading line carries "<passed> / <scored> passing" and the
   caller's action buttons. User text (names, summaries) is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ConfirmDialog, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { useAgentEvalCases, useAgentEvalRuns, useDeleteEvalCase } from "@/lib/hooks/evals";
import { isFinished } from "@/lib/eval-format";
import { RowButton } from "./_components/RowButton";
import { s } from "./styles";

/** Case count below which the "8+ cases recommended" hint is shown. */
const RECOMMENDED_CASES = 8;

type StatusKey = "statusPassed" | "statusFailed" | "statusErrored" | "statusNever";

const statusKey = (c: EvalCase): StatusKey => {
  const r = c.last_result;
  if (!r) return "statusNever";
  return r.status === "pass" ? "statusPassed" : r.status === "fail" ? "statusFailed" : "statusErrored";
};

function StatusIcon({ status, label }: { status: StatusKey; label: string }) {
  const color =
    status === "statusPassed" ? "var(--ok)" : status === "statusNever" ? "var(--text-muted)" : "var(--crit)";
  const I =
    status === "statusPassed"
      ? Icon.CheckCircle
      : status === "statusFailed"
        ? Icon.XCircle
        : status === "statusErrored"
          ? Icon.AlertTriangle
          : Icon.Dot;
  return (
    <span role="img" aria-label={label} title={label} style={{ ...s.statusIcon, color }}>
      <I size={16} />
    </span>
  );
}

export function CaseList({
  agentId,
  actions,
  runDisabled,
  onRunCase,
  onEdit,
}: {
  agentId: string;
  /** Buttons for the heading line (Run all evals, New eval case). */
  actions?: React.ReactNode;
  /** A run is `running` or `queued`: every row run button is disabled. */
  runDisabled: boolean;
  onRunCase: (caseId: string) => void;
  onEdit: (caseId: string) => void;
}) {
  const t = useTranslations("eval");
  const casesQ = useAgentEvalCases(agentId);
  const runsQ = useAgentEvalRuns(agentId);
  const del = useDeleteEvalCase(agentId);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);

  const latest = React.useMemo(
    () => (runsQ.data ?? []).filter((r) => isFinished(r) && r.scope === "all").sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0],
    [runsQ.data],
  );

  if (casesQ.isLoading) {
    return (
      <div style={s.wrap} data-testid="cases-skeleton" aria-busy="true">
        <Skeleton height={44} />
        <div style={{ height: 8 }} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (casesQ.isError) {
    return <ErrorState body={t("evalsTab.loadError")} onRetry={() => void casesQ.refetch()} />;
  }

  const cases = casesQ.data ?? [];
  const chipText = (c: EvalCase): string => {
    if (c.expected.length === 0) return t("evalsTab.chipEmpty");
    const first = c.expected.find((e) => e.kind === "must_find");
    if (!first) return t("evalsTab.kindMustNotFlag");
    const more = c.expected.length - 1;
    return `${first.severity} · ${first.category}${more > 0 ? ` ${t("evalsTab.chipMore", { count: more })}` : ""}`;
  };

  return (
    <section style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
        {latest?.counts && (
          <span style={s.passing}>
            {t("evalsTab.passingSummary", { passed: latest.counts.cases_passed, scored: latest.counts.cases_scored })}
          </span>
        )}
        <div style={s.actions}>{actions}</div>
      </div>
      <div style={s.count}>
        {t("evalsTab.casesCount", { count: cases.length })}
        {cases.length < RECOMMENDED_CASES && <span style={s.hint}> · {t("evalsTab.moreCasesHint")}</span>}
      </div>

      {cases.length === 0 ? (
        <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => (
            <li key={c.id} style={s.row} aria-label={c.name}>
              <StatusIcon status={statusKey(c)} label={t(`evalsTab.${statusKey(c)}`)} />
              <div style={s.main}>
                <span style={s.name} title={c.name} data-testid="case-name">
                  {c.name}
                </span>
                <div style={s.summary}>
                  <span>{c.last_result ? c.last_result.summary : t("evalsTab.neverRun")}</span>
                  {c.last_result && c.last_result.case_revision < c.revision && (
                    <span style={s.edited}>{t("evalsTab.editedSinceRun")}</span>
                  )}
                </div>
              </div>
              <Badge color="var(--accent)" bg="var(--accent-bg)">
                {chipText(c)}
              </Badge>
              <RowButton
                icon="Play"
                label={t("evalsTab.runCase", { name: c.name })}
                disabled={runDisabled}
                onClick={() => onRunCase(c.id)}
              />
              <RowButton icon="Edit" label={t("evalsTab.editCase", { name: c.name })} onClick={() => onEdit(c.id)} />
              <RowButton icon="Trash" label={t("evalsTab.deleteCase", { name: c.name })} onClick={() => setPendingDelete(c)} />
            </li>
          ))}
        </ul>
      )}
      {del.isError && <div role="alert" style={s.error}>{del.error.message}</div>}

      {pendingDelete && (
        <ConfirmDialog
          title={t("evalsTab.deleteTitle")}
          body={t("evalsTab.deleteBody", { name: pendingDelete.name })}
          confirmLabel={t("evalsTab.deleteConfirm")}
          cancelLabel={t("evalsTab.cancel")}
          loading={del.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
        />
      )}
    </section>
  );
}
