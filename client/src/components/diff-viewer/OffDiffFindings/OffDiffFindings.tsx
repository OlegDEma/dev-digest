/* OffDiffFindings — footer list for findings whose line is not in this file's
   patch (or the file has no patch), so none is silently dropped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DiffAnnotation, DiffAnnotationApi } from "../annotations";
import { cs } from "../comments";

export function OffDiffFindings({
  items,
  render,
}: {
  items: DiffAnnotation[];
  render: DiffAnnotationApi["render"];
}) {
  const t = useTranslations("shell");
  if (items.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.findingsOutsideDiff")}</span>
      {items.map((a) => (
        <React.Fragment key={a.id}>{render(a.id)}</React.Fragment>
      ))}
    </div>
  );
}
