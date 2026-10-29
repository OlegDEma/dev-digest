/* EvalsTab — the agent's eval cases, run controls, metrics and history. A run
   is started with "Run all evals (N)"; its progress is polled every 4 s (in
   useEvalRun). A 409 attaches to the run already in progress. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgentEvalCases, useAgentEvalRuns, useEvalRun, useStartEvalRun } from "@/lib/hooks/evals";
import { CaseList } from "./_components/CaseList";
import { CompareModal } from "./_components/CompareModal";
import { MetricCards } from "./_components/MetricCards";
import { RunHistory } from "./_components/RunHistory";
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
  const startRun = useStartEvalRun(agent.id);
  const [attachedRunId, setAttachedRunId] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<StartError | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);

  const listRunning = (runsQ.data ?? []).find((r) => r.status === "running");
  const trackedRunId = attachedRunId ?? listRunning?.id ?? null;
  const runQ = useEvalRun(trackedRunId);

  const caseCount = casesQ.data?.length ?? 0;
  const isRunning =
    startRun.isPending ||
    runQ.data?.status === "running" ||
    (!runQ.data && !!trackedRunId && !runQ.isError) ||
    (!runQ.data && !!listRunning);
  const progress = runQ.data?.progress ?? listRunning?.progress ?? { done: 0, total: caseCount };
  const reconnecting = !!trackedRunId && runQ.isError;

  const onRun = () => {
    setStartError(null);
    startRun.mutate(undefined, {
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

  const toggle = (runId: string) =>
    setSelected((cur) => (cur.includes(runId) ? cur.filter((id) => id !== runId) : [...cur, runId]));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titles}>
          <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
          <div style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</div>
        </div>
        <Button kind="primary" icon="Play" disabled={caseCount === 0 || isRunning} onClick={onRun}>
          {t("evalsTab.runAll", { count: caseCount })}
        </Button>
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
      <CaseList agentId={agent.id} />
      <RunHistory agentId={agent.id} selected={selected} onToggle={toggle} onCompare={() => setComparing(true)} />

      {comparing && selected.length === 2 && (
        <CompareModal runIds={[selected[0] as string, selected[1] as string]} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
