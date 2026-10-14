/* ReviewFocus — "read these first": file:line — reason, each a link into Files
   changed (or a notice when the file is only in the blast map). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  /** First generation in flight and no brief yet. */
  loading?: boolean;
  onOpenRef: (path: string, line: number | null) => void;
}

export function ReviewFocus({ items, loading = false, onOpenRef }: ReviewFocusProps) {
  const t = useTranslations("brief");
  return (
    <section>
      <div style={s.card}>
        <div style={s.title}>
          <SectionLabel icon="Target">{t("prBrief.reviewFocus.title")}</SectionLabel>
        </div>
        {loading ? (
          <div aria-busy="true" data-testid="focus-skeleton">
            <Skeleton height={48} />
          </div>
        ) : items.length === 0 ? (
          <span style={s.empty}>{t("prBrief.reviewFocus.empty")}</span>
        ) : (
          <>
            <div style={s.count}>{t("prBrief.reviewFocus.count", { count: items.length })}</div>
            <ul style={s.list}>
              {items.map((it, i) => (
                <li key={`${i}-${it.file}:${it.line}`} style={s.item}>
                  <button
                    type="button"
                    className="mono"
                    style={s.link}
                    aria-label={t("prBrief.openLineAria", { path: it.file, line: it.line })}
                    onClick={() => onOpenRef(it.file, it.line)}
                  >
                    {it.file}:{it.line}
                  </button>
                  <span style={s.reason}>— {it.reason}</span>
                  {it.line_corrected && <span style={s.marker}>({t("prBrief.reviewFocus.lineAdjusted")})</span>}
                  {it.source === "blast_map" && <span style={s.marker}>({t("prBrief.reviewFocus.outsideDiff")})</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
