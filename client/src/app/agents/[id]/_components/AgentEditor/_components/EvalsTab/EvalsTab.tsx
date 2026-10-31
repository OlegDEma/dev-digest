/* EvalsTab — the agent's eval metrics and eval cases with their run controls and
   the case editor. A run (all cases, or one via a row's ▷) is started here; its
   progress is polled every 4 s (in useEvalRun). While a run is `running` or
   `queued` every run button is disabled. A 409 attaches to the run already in
   progress. Run history and Compare live on the per-agent eval page. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { EvalCaseEditor } from "@/components/eval-case-editor";
import type { Agent } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgentEvalCases, useAgentEvalRuns, useEvalRun, useStartEvalRun } from "@/lib/hooks/evals";
import { CaseList } from "./_components/CaseList";
import { MetricCards } from "./_components/MetricCards";
import { s } from "./styles";

const SETTINGS_API_KEYS_HREF = "/settings/api-keys";

interface StartError {
  code?: string;
  message: string;
}

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const casesQ = useAgentEvalCases(agent.id);
  const runsQ = useAgentEvalRuns(agent.id);
  const startRun = useStartEvalRun(agent.id, { silentError: true });
  const [attachedRunId, setAttachedRunId] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<StartError | null>(null);
  const [editor, setEditor] = React.useState<{ caseId: string | null } | null>(null);

  const listRunning = (runsQ.data ?? []).find((r) => r.status === "running" || r.status === "queued");
  const trackedRunId = listRunning?.id ?? attachedRunId;
  const runQ = useEvalRun(trackedRunId);

  const caseCount = casesQ.data?.length ?? 0;
  const isRunning =
    startRun.isPending ||
    runQ.data?.status === "running" ||
    runQ.data?.status === "queued" ||
    (!runQ.data && !!trackedRunId && !runQ.isError) ||
    !!listRunning;
  const progress = runQ.data?.progress ?? listRunning?.progress ?? { done: 0, total: caseCount };
  const reconnecting = !!trackedRunId && runQ.isError;

  const onRun = (caseId?: string) => {
    setStartError(null);
    startRun.mutate(caseId ? { case_id: caseId } : undefined, {
      onSuccess: (run) => setAttachedRunId(run.id),
      onError: (err) => {
        const details = err instanceof ApiError ? (err.details as { run_id?: string } | undefined) : undefined;
        if (err instanceof ApiError && err.code === "eval_run_in_progress" && details?.run_id) {
          setAttachedRunId(details.run_id);
          return;
        }
        setStartError({ code: err instanceof ApiError ? err.code : undefined, message: err.message });
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titles}>
          <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
          <div style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</div>
        </div>
        <Link href={`/eval/${agent.id}`} style={s.dashboardLink}>
          {t("evalsTab.viewDashboard")}
        </Link>
      </div>

      {isRunning && (
        <div role="status" style={s.status}>
          {t("evalsTab.runningProgress", { done: progress.done, total: progress.total })}
        </div>
      )}
      {reconnecting && (
        <div role="status" style={s.reconnecting}>
          {t("evalsTab.reconnecting")}
        </div>
      )}
      {startError && (
        <div role="alert" style={s.error}>
          {startError.code === "no_eval_cases" ? t("evalsTab.noCasesToRun") : startError.message}
          {startError.code === "provider_not_configured" && (
            <Link href={SETTINGS_API_KEYS_HREF} style={s.link}>
              {t("evalsTab.openApiKeys")}
            </Link>
          )}
        </div>
      )}

      <MetricCards agentId={agent.id} />
      <CaseList
        agentId={agent.id}
        runDisabled={isRunning}
        onRunCase={(caseId) => onRun(caseId)}
        onEdit={(caseId) => setEditor({ caseId })}
        actions={
          <>
            <Button kind="primary" icon="Play" disabled={caseCount === 0 || isRunning} onClick={() => onRun()}>
              {t("evalsTab.runAll", { count: caseCount })}
            </Button>
            <Button kind="secondary" icon="Plus" onClick={() => setEditor({ caseId: null })}>
              {t("evalsTab.newCase")}
            </Button>
          </>
        }
      />

      {editor && (
        <EvalCaseEditor
          agent={{ id: agent.id, name: agent.name }}
          caseId={editor.caseId}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
