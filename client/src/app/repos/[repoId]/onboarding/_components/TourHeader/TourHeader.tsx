/* TourHeader — title, subtitle, stats line, Partial badge, stale marker,
   Regenerate and Share link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { OnboardingIndexSummary, OnboardingTour } from "@devdigest/shared";
import { isStale, relativeAgo, statsParts, subtitleParts } from "../../helpers";
import { s } from "./styles";

export function TourHeader({
  repoName,
  tour,
  currentIndex,
  generating,
  onRegenerate,
}: {
  repoName: string;
  tour: OnboardingTour;
  currentIndex: OnboardingIndexSummary;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);
  const sub = subtitleParts(tour);
  const stats = statsParts(tour.llm, tour.mode);
  const time = relativeAgo(tour.generated_at);

  const callsText =
    stats.attempts != null
      ? t("stats.callsWithAttempts", { count: stats.calls, attempts: stats.attempts })
      : t("stats.calls", { count: stats.calls });
  const statsText = stats.callsOnly
    ? callsText
    : [
        callsText,
        stats.tokens != null ? t("stats.tokens", { count: stats.tokens }) : null,
        stats.cost != null ? t("stats.cost", { cost: stats.cost }) : t("stats.costUnknown"),
        stats.model,
      ]
        .filter(Boolean)
        .join(" · ");

  const partialText = tour.partial_reasons
    .map((r) =>
      t(`partialReasons.${r}`, {
        indexed: tour.index.files_indexed,
        total: tour.index.source_files_total ?? tour.index.files_indexed,
        count: tour.index.files_skipped,
      }),
    )
    .join("; ");

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing to confirm */
    }
  };

  return (
    <header style={s.header}>
      <div style={s.text}>
        <h1 style={s.h1}>
          {t.rich("header.title", { repo: repoName, name: (chunks) => <span style={s.name}>{chunks}</span> })}
        </h1>
        <p style={s.line}>
          {sub.total != null
            ? t("header.subtitleWithTotal", { indexed: sub.indexed, total: sub.total, time })
            : t("header.subtitleWithoutTotal", { indexed: sub.indexed, time })}
        </p>
        <p style={s.line}>{statsText}</p>
        <div style={s.badges}>
          {tour.completeness === "partial" && (
            <>
              <Badge>
                <span aria-describedby="onboarding-partial-reasons">{t("header.partial")}</span>
              </Badge>
              <span id="onboarding-partial-reasons" style={s.reasons}>
                {partialText}
              </span>
            </>
          )}
          {isStale(currentIndex, tour) && <span style={s.stale}>{t("header.stale")}</span>}
        </div>
      </div>
      <div style={s.actions}>
        <Button kind="secondary" icon="RefreshCw" disabled={generating} onClick={onRegenerate}>
          {generating ? t("regenerating") : t("regenerate")}
        </Button>
        <Button kind="ghost" icon="Link" onClick={() => void share()}>
          {copied ? t("linkCopied") : t("share")}
        </Button>
      </div>
    </header>
  );
}
