/* TourBanners — skeleton banner (AC-31), regeneration-failure banner (AC-71,
   only while `last_failure` is set), dropped-items notice (AC-72) and the
   generate error / 409 message (AC-70). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type {
  OnboardingIndexSummary,
  OnboardingLastFailure,
  OnboardingSkeletonReason,
  OnboardingTour,
} from "@devdigest/shared";
import { ApiError } from "../../../../../../lib/api";
import { GENERATION_IN_PROGRESS } from "../../constants";
import { relativeAgo } from "../../helpers";
import { s } from "./styles";

export function TourBanners({
  tour,
  lastFailure,
  currentIndex,
  generateError,
}: {
  tour: OnboardingTour | null;
  lastFailure: OnboardingLastFailure | null;
  currentIndex: OnboardingIndexSummary;
  generateError: Error | null;
}) {
  const t = useTranslations("onboarding");

  const reasonText = (
    reason: OnboardingSkeletonReason,
    vars: { status: string; provider: string | null; attempts: number | null },
  ) => {
    const values = {
      status: vars.status,
      provider: vars.provider ?? t("skeleton.providerFallback"),
      attempts: vars.attempts ?? 0,
    };
    return {
      sentence: t(`skeleton.reasons.${reason}.sentence`, values),
      nextStep: t(`skeleton.reasons.${reason}.nextStep`, values),
    };
  };

  const conflict = generateError instanceof ApiError && generateError.code === GENERATION_IN_PROGRESS;

  return (
    <>
      {generateError && (
        <p role="alert" style={s.failure}>
          {conflict ? t("conflict") : t("generateError")}
        </p>
      )}
      {tour?.mode === "skeleton" && tour.skeleton_reason && (
        <p role="status" style={s.skeleton}>
          {t("skeleton.banner", {
            ...reasonText(tour.skeleton_reason, {
              status: tour.index.status,
              provider: tour.llm.provider,
              attempts: tour.llm.attempts,
            }),
          })}
        </p>
      )}
      {tour && lastFailure && (
        <p role="status" style={s.failure}>
          {t("skeleton.failure", {
            ...reasonText(lastFailure.reason, {
              status: currentIndex.status,
              provider: lastFailure.provider,
              attempts: lastFailure.attempts,
            }),
            time: relativeAgo(tour.generated_at),
          })}
        </p>
      )}
      {tour && tour.dropped_ai_items > 0 && (
        <p style={s.notice}>{t("droppedItems", { count: tour.dropped_ai_items })}</p>
      )}
    </>
  );
}
