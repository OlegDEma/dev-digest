/* PrBriefSection — the "PR Brief" card: generate / refresh the stored brief and
   show its summary, gaps and provenance. Presentational: OverviewTab owns the
   hooks because the brief also feeds Risk areas and Review focus. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { droppedTotal, formatCost, missingLines, shortSha, truncateSummary } from "./helpers";
import { s } from "./styles";

export interface PrBriefSectionProps {
  isLoading: boolean;
  loadError: Error | null;
  onRetry: () => void;
  brief: PrBrief | null;
  stale: boolean;
  generating: boolean;
  generateError: Error | null;
  onGenerate: () => void;
}

export function PrBriefSection({
  isLoading,
  loadError,
  onRetry,
  brief,
  stale,
  generating,
  generateError,
  onGenerate,
}: PrBriefSectionProps) {
  const t = useTranslations("brief");
  const title = (
    <div style={s.title}>
      <SectionLabel icon="Sparkles">{t("prBrief.title")}</SectionLabel>
    </div>
  );

  if (isLoading) {
    return (
      <section>
        <div style={s.card}>
          {title}
          <Skeleton height={72} />
        </div>
      </section>
    );
  }
  if (loadError) {
    return (
      <section>
        <div style={s.card}>
          {title}
          <ErrorState title={t("prBrief.loadFailed")} body={loadError.message} onRetry={onRetry} />
        </div>
      </section>
    );
  }

  const failure = generateError && (
    <div role="alert" style={s.error}>
      {t("prBrief.generateFailed")}: {generateError.message}
    </div>
  );

  if (!brief) {
    return (
      <section>
        <div style={s.card}>
          {title}
          {generating ? (
            <div aria-busy="true" data-testid="brief-skeleton">
              <Skeleton height={72} />
            </div>
          ) : (
            failure
          )}
          <div>
            <Button kind="primary" size="sm" onClick={onGenerate} disabled={generating} loading={generating}>
              {t("prBrief.generate")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const lines = missingLines(brief.missing_inputs, brief.specs);
  const dropped = droppedTotal(brief.dropped);
  const gap = lines
    .map((l) =>
      l.kind === "input"
        ? t(`prBrief.missingInput.${l.input!}`)
        : t("prBrief.specSkipped", { path: l.path!, reason: t(`prBrief.specReason.${l.reason!}`) }),
    )
    .join(", ");

  return (
    <section>
      <div style={s.card}>
        {title}
        <div style={s.headerRow}>
          {stale && <Badge color="var(--warn)">{t("prBrief.stale")}</Badge>}
          <span style={s.spacer} />
          <Button size="sm" onClick={onGenerate} disabled={generating} loading={generating}>
            {t("prBrief.refresh")}
          </Button>
        </div>

        <p style={s.summary}>{truncateSummary(brief.summary)}</p>

        {failure}

        {lines.length > 0 && (
          <div style={s.warn}>
            {t("prBrief.generatedWithout")} {gap}
          </div>
        )}
        {dropped > 0 && <div style={s.muted}>{t("prBrief.dropped", { count: dropped })}</div>}
        {brief.corrected_lines > 0 && <div style={s.muted}>{t("prBrief.corrected", { count: brief.corrected_lines })}</div>}

        <div className="mono" style={s.footer}>
          {t("prBrief.footer", {
            model: brief.model,
            inTokens: brief.input_tokens,
            budget: brief.input_budget,
            outTokens: brief.tokens_out,
            cost: formatCost(brief.cost_usd, t("prBrief.costUnknown")),
            attempts: brief.attempts,
            sha: shortSha(brief.head_sha),
            time: new Date(brief.generated_at).toLocaleString("en"),
          })}
        </div>
      </div>
    </section>
  );
}
