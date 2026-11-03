/* RegressionBanner — yellow, announced banner when the latest full run dropped at
   least one whole point on a metric versus the previous one. The text is composed
   here from the server's `regression` deltas (no LLM); icon and words carry the
   meaning, not colour. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRegression } from "@devdigest/shared";
import { composeBanner } from "./helpers";
import { s } from "./styles";

export function RegressionBanner({ regression }: { regression: EvalRegression | null }) {
  const t = useTranslations("evalDashboard");
  if (!regression || regression.drops.length === 0) return null;

  const text = composeBanner(regression, t);

  return (
    <div role="status" style={s.banner}>
      <Icon.AlertTriangle size={16} aria-hidden />
      <span>{text}</span>
    </div>
  );
}
