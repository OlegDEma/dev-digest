/* CompareModal — side-by-side of two finished eval runs: metric cards with
   signed deltas, a line diff of the system prompts, model/strategy/skill
   changes and a dataset-change warning. Escape / Close dismiss it; the run
   selection lives in the parent and is untouched. Everything user-authored
   (prompts, skill names) is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalRunDetail } from "@devdigest/shared";
import { useEvalRun } from "@/lib/hooks/evals";
import {
  caseSetDiff,
  configDiff,
  formatCost,
  formatCostDelta,
  formatDelta,
  formatPct,
  lineDiff,
} from "@/lib/eval-format";
import { s } from "./styles";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const scoredKeys = (r: EvalRunDetail) =>
  r.results.filter((c) => c.status !== "error").map((c) => c.case_id ?? `name:${c.case_name}`);

export function CompareModal({ runIds, onClose }: { runIds: readonly [string, string]; onClose: () => void }) {
  const t = useTranslations("eval");
  const q1 = useEvalRun(runIds[0]);
  const q2 = useEvalRun(runIds[1]);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  // Focus the dialog on open and give focus back to the opener on close.
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  React.useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const failed = q1.isError || q2.isError;
  const loaded = q1.data && q2.data;
  let a: EvalRunDetail | undefined;
  let b: EvalRunDetail | undefined;
  if (loaded) {
    [a, b] = Date.parse(q1.data.started_at) <= Date.parse(q2.data.started_at) ? [q1.data, q2.data] : [q2.data, q1.data];
  }

  return (
    <div style={s.overlay}>
      <div style={s.backdrop} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={s.dialog}
      >
        <div style={s.header}>
          <h2 id={titleId} style={s.title}>
            {a && b
              ? t("compare.title", { a: a.config.agent_version, b: b.config.agent_version })
              : t("evalsTab.compare")}
          </h2>
        </div>

        <div style={s.body}>
          {failed ? (
            <div role="alert" style={s.error}>
              {t("compare.loadError")}
            </div>
          ) : !a || !b ? (
            <div role="status" style={s.center}>
              <Icon.RefreshCw size={16} />
              {t("compare.loading")}
            </div>
          ) : (
            <CompareBody a={a} b={b} />
          )}
        </div>

        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("compare.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompareBody({ a, b }: { a: EvalRunDetail; b: EvalRunDetail }) {
  const t = useTranslations("eval");
  const diff = React.useMemo(() => lineDiff(a.config.system_prompt, b.config.system_prompt), [a, b]);
  const promptChanged = a.config.system_prompt !== b.config.system_prompt;
  const changes = React.useMemo(() => configDiff(a.config, b.config), [a, b]);
  const cases = caseSetDiff(scoredKeys(a), scoredKeys(b));

  const metric = (label: string, key: "recall" | "precision" | "citation_accuracy") => {
    const from = a.metrics?.[key];
    const to = b.metrics?.[key];
    return (
      <div style={s.card} data-testid={`compare-${key}`}>
        <div style={s.cardLabel}>{label}</div>
        <div style={s.cardValue}>
          {formatPct(from)} → {formatPct(to)}
        </div>
        <div style={s.cardDelta}>{formatDelta(to, from) ?? "—"}</div>
      </div>
    );
  };

  const changeText = (c: (typeof changes)[number]) => {
    switch (c.kind) {
      case "model":
        return t("compare.modelChanged", { from: c.from, to: c.to });
      case "strategy":
        return t("compare.strategyChanged", { from: c.from, to: c.to });
      case "skill_added":
        return t("compare.skillAdded", { name: c.name });
      case "skill_removed":
        return t("compare.skillRemoved", { name: c.name });
      case "skill_version":
        return t("compare.skillVersion", { name: c.name, from: c.from, to: c.to });
    }
  };

  return (
    <>
      <div style={s.cards}>
        {metric(t("compare.recall"), "recall")}
        {metric(t("compare.precision"), "precision")}
        {metric(t("compare.citation"), "citation_accuracy")}
        <div style={s.card} data-testid="compare-cost">
          <div style={s.cardLabel}>{t("compare.cost")}</div>
          <div style={s.cardValue}>
            {formatCost(a.cost_usd)} → {formatCost(b.cost_usd)}
          </div>
          <div style={s.cardDelta}>{formatCostDelta(a.cost_usd, b.cost_usd) ?? "—"}</div>
        </div>
      </div>

      {(cases.added > 0 || cases.removed > 0) && (
        <div role="note" style={s.warn}>
          {t("compare.datasetWarning", { added: cases.added, removed: cases.removed })}
        </div>
      )}

      <div style={s.section}>
        <h3 style={s.h3}>{t("compare.promptHeading")}</h3>
        {promptChanged ? (
          <pre style={s.pre} data-testid="prompt-diff">
            {diff.map((l, i) => (
              <div key={i} style={s.line(l.op)}>
                {l.op} {l.text}
              </div>
            ))}
          </pre>
        ) : (
          <div style={s.muted}>{t("compare.noPromptChange")}</div>
        )}
      </div>

      <div style={s.section}>
        <h3 style={s.h3}>{t("compare.configHeading")}</h3>
        {changes.length === 0 ? (
          <div style={s.muted}>{t("compare.sameConfig")}</div>
        ) : (
          <ul style={s.list}>
            {changes.map((c, i) => (
              <li key={i}>{changeText(c)}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
