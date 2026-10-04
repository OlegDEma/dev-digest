/* OrderToggle — segmented Smart order | Original order switch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export type DiffOrder = "smart" | "original";

export function OrderToggle({
  value,
  onChange,
}: {
  value: DiffOrder;
  onChange: (next: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderLabel")} style={{ display: "inline-flex", gap: 4 }}>
      <Button size="sm" active={value === "smart"} aria-pressed={value === "smart"} onClick={() => onChange("smart")}>
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        size="sm"
        active={value === "original"}
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
