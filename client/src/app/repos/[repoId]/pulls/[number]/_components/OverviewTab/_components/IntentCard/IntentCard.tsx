/* IntentCard — the PR's derived intent (summary, scope, risks, sources) with a
   Recompute action. Sits above the Description on the Overview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRecomputeIntent } from "../../../../../../../../../lib/hooks/intent";
import { notify } from "../../../../../../../../../lib/toast";
import { confidenceColor, formatCost } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId, pollWhileRunning }: { prId: string; pollWhileRunning: boolean }) {
  const t = useTranslations("brief");
  const q = usePrIntent(prId, { pollWhileRunning });
  const recompute = useRecomputeIntent(prId);
  const [showSources, setShowSources] = React.useState(false);

  const run = () =>
    recompute.mutate(undefined, {
      onSuccess: () => notify.success(t("intent.recomputed")),
      onError: (e) => notify.error(`${t("intent.failed")}: ${(e as Error).message}`),
    });

  if (q.isLoading) {
    return (
      <section>
        <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>
        <Skeleton height={72} />
      </section>
    );
  }
  if (q.isError) {
    return (
      <section>
        <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>
        <ErrorState body={(q.error as Error).message} onRetry={() => q.refetch()} />
      </section>
    );
  }

  const intent = q.data?.intent ?? null;
  const stale = q.data?.stale ?? false;

  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>
        <div style={s.card}>
          <span style={s.muted}>{t("intent.empty")}</span>
          <div>
            <Button kind="primary" size="sm" onClick={run} disabled={recompute.isPending} loading={recompute.isPending}>
              {t("intent.derive")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>
      <div style={s.card}>
        <div style={s.headerRow}>
          <Badge color={confidenceColor(intent.confidence)}>{t(`intent.confidence.${intent.confidence}`)}</Badge>
          {stale && <Badge color="var(--warn)">{t("intent.stale")}</Badge>}
          <span style={s.spacer} />
          <Button size="sm" onClick={run} disabled={recompute.isPending} loading={recompute.isPending}>
            {t("intent.recompute")}
          </Button>
        </div>

        <blockquote style={s.summary}>“{intent.summary}”</blockquote>

        <div style={s.columns}>
          <div>
            <div style={s.colTitle("var(--ok)")}>✓ {t("intent.inScope")}</div>
            <ul style={s.list}>
              {intent.in_scope.map((x, i) => (
                <li key={`${i}-${x}`}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <div style={s.colTitle("var(--crit)")}>✕ {t("intent.outOfScope")}</div>
            <ul style={s.list}>
              {intent.out_of_scope.map((x, i) => (
                <li key={`${i}-${x}`}>{x}</li>
              ))}
            </ul>
          </div>
        </div>

        <div style={s.divider} />

        {intent.risk_areas.length > 0 && (
          <div>
            <div style={s.colTitle("var(--text-muted)")}>{t("intent.riskAreas")}</div>
            <div style={s.chips}>
              {intent.risk_areas.map((r, i) => (
                <Badge key={`${i}-${r.label}`} style={s.chip}>
                  {r.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {intent.missing_context.length > 0 && (
          <div>
            <div style={s.colTitle("var(--warn)")}>{t("intent.missingContext")}</div>
            <ul style={{ ...s.list, ...s.missing }}>
              {intent.missing_context.map((x, i) => (
                <li key={`${i}-${x}`}>{x}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <button type="button" style={s.sourcesToggle} aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
            {showSources ? "▾" : "▸"} {t("intent.sources")} ({intent.sources.length})
          </button>
          {showSources && (
            <ul style={s.list}>
              {intent.sources.map((src, i) => (
                <li key={`${i}-${src.kind}-${src.ref}`} style={s.sourceRow(src.status === "unresolved")}>
                  {src.kind} · {src.ref} · {t(`intent.sourceStatus.${src.status}`)}
                  {src.reason ? ` — ${src.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mono" style={s.footer}>
          {intent.model ?? "—"} · {intent.tokens_in + intent.tokens_out} tok · {formatCost(intent.cost_usd)} ·{" "}
          {t("intent.saved", { count: intent.diff_tokens_saved })}
        </div>
      </div>
    </section>
  );
}
