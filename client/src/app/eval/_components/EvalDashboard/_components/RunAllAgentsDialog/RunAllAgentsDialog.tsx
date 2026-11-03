/* RunAllAgentsDialog — confirms a batch eval run before any LLM call: which agents
   will run, their case counts, the total number of reviews and who is skipped.
   One POST /eval-runs/batch; the start button is disabled until it answers, then
   the dialog lists started / queued / skipped — reason, or the error with Retry. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalBatchResult, EvalDashboardOverview } from "@devdigest/shared";
import { useStartEvalBatch } from "@/lib/hooks/eval-dashboards";
import { s } from "./styles";

type Agents = EvalDashboardOverview["agents"];

/** Enabled agents with at least one eval case; the server makes the final call per agent. */
export function splitEligible(agents: Agents) {
  const eligible = agents.filter((a) => a.enabled && a.cases_total > 0);
  const skipped = agents.filter((a) => !a.enabled || a.cases_total === 0);
  return { eligible, skipped, reviews: eligible.reduce((n, a) => n + a.cases_total, 0) };
}

export function RunAllAgentsDialog({
  agents,
  onClose,
  onStarted,
}: {
  agents: Agents;
  onClose: () => void;
  /** Ids of the runs the batch started or queued, so the page can watch them finish. */
  onStarted?: (runIds: string[]) => void;
}) {
  const t = useTranslations("evalDashboard");
  const batch = useStartEvalBatch();
  const [result, setResult] = React.useState<EvalBatchResult | null>(null);
  const { eligible, skipped, reviews } = splitEligible(agents);

  React.useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !batch.isPending) onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose, batch.isPending]);

  const start = () => batch.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res);
        onStarted?.([...res.started, ...res.queued].map((i) => i.run_id));
      },
    });

  if (result) {
    const nothing = result.started.length + result.queued.length + result.skipped.length === 0;
    return (
      <Modal width={520} title={t("runAll.title")} onClose={onClose} footer={<Footer><Button kind="secondary" onClick={onClose}>{t("runAll.close")}</Button></Footer>}>
        <div style={s.body} data-testid="batch-result">
          {nothing && <p style={s.p}>{t("runAll.nothing")}</p>}
          {result.started.length > 0 && (
            <Section heading={t("runAll.started")}>
              {result.started.map((i) => (
                <li key={i.run_id}>
                  {i.agent_name} · {t("runAll.cases", { count: i.cases })}
                </li>
              ))}
            </Section>
          )}
          {result.queued.length > 0 && (
            <Section heading={t("runAll.queued")}>
              {result.queued.map((i) => (
                <li key={i.run_id}>
                  {i.agent_name} · {t("runAll.cases", { count: i.cases })}
                </li>
              ))}
            </Section>
          )}
          {result.skipped.length > 0 && (
            <Section heading={t("runAll.skippedHeading")}>
              {result.skipped.map((i) => (
                <li key={i.agent_id}>
                  {i.agent_name} — {t(`runAll.reason.${i.reason}`)}
                </li>
              ))}
            </Section>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      width={520}
      title={t("runAll.title")}
      onClose={batch.isPending ? undefined : onClose}
      footer={
        <Footer>
          <Button kind="secondary" onClick={onClose} disabled={batch.isPending}>
            {t("runAll.cancel")}
          </Button>
          <Button kind="primary" icon="Play" onClick={start} disabled={batch.isPending || eligible.length === 0}>
            {batch.isPending ? t("runAll.starting") : t("runAll.start", { count: eligible.length })}
          </Button>
        </Footer>
      }
    >
      <div style={s.body}>
        <p style={s.p}>{t("runAll.intro")}</p>
        {eligible.length === 0 ? (
          <p style={s.p}>{t("runAll.none")}</p>
        ) : (
          <Section heading={t("runAll.eligible")}>
            {eligible.map((a) => (
              <li key={a.agent_id}>
                {a.name} · {t("runAll.cases", { count: a.cases_total })}
              </li>
            ))}
          </Section>
        )}
        {eligible.length > 0 && <p style={s.total}>{t("runAll.total", { count: reviews })}</p>}
        {skipped.length > 0 && <p style={s.muted}>{t("runAll.skipped", { names: skipped.map((a) => a.name).join(", ") })}</p>}
        {batch.isError && (
          <div role="alert" style={s.error}>
            {t("runAll.failed", { message: batch.error.message })}{" "}
            <Button kind="secondary" size="sm" onClick={start} disabled={batch.isPending}>
              {t("runAll.retry")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div style={s.footer}>{children}</div>;
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={s.h3}>{heading}</h3>
      <ul style={s.list}>{children}</ul>
    </div>
  );
}
