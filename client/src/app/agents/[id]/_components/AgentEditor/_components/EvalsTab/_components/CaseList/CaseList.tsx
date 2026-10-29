/* CaseList — the agent's eval cases: name (one line, full name on hover and to
   screen readers), expectation kind, file:lines, SEVERITY · category and the
   last result. User text (names, titles, summaries) is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ConfirmDialog, ErrorState, IconBtn, Skeleton } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { useAgentEvalCases, useAgentEvalRuns, useDeleteEvalCase } from "@/lib/hooks/evals";
import { isFinished } from "@/lib/eval-format";
import { s } from "./styles";

/** Case count below which the "8+ cases recommended" hint is shown. */
const RECOMMENDED_CASES = 8;

const lineRange = (c: EvalCase) =>
  c.expectation.end_line > c.expectation.start_line
    ? `${c.expectation.start_line}-${c.expectation.end_line}`
    : String(c.expectation.start_line);

export function CaseList({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const casesQ = useAgentEvalCases(agentId);
  const runsQ = useAgentEvalRuns(agentId);
  const del = useDeleteEvalCase(agentId);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);

  const latest = React.useMemo(
    () => (runsQ.data ?? []).filter(isFinished).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0],
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
  const resultLabel = (c: EvalCase) => {
    const r = c.last_result;
    if (!r) return t("evalsTab.neverRun");
    return r.status === "pass" ? t("evalsTab.passed") : r.status === "fail" ? t("evalsTab.failed") : t("evalsTab.errored");
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
              <div style={s.main}>
                <span style={s.name} title={c.name} data-testid="case-name">
                  {c.name}
                </span>
                <div style={s.meta}>
                  <Badge color="var(--accent)" bg="var(--accent-bg)">
                    {c.expectation.kind === "must_find" ? t("evalsTab.kindMustFind") : t("evalsTab.kindMustNotFlag")}
                  </Badge>
                  <span style={s.mono}>
                    {c.expectation.file}:{lineRange(c)}
                  </span>
                  <span>
                    {c.display.severity} · {c.display.category}
                  </span>
                </div>
              </div>
              <div style={s.result}>
                <div>{resultLabel(c)}</div>
                {c.last_result && <div>{c.last_result.summary}</div>}
              </div>
              <IconBtn
                icon="Trash"
                label={t("evalsTab.deleteCase", { name: c.name })}
                onClick={() => setPendingDelete(c)}
              />
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
