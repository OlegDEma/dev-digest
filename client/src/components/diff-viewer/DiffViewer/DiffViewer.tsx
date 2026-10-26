/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";

/** Deep-link target: only the card whose path is exactly `path` reacts to it. */
export interface DiffTarget {
  path: string;
  line: number | null;
  nonce: number;
}

export function DiffViewer({
  files,
  commenting,
  target,
  onTargetHandled,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  target?: DiffTarget;
  onTargetHandled?: () => void;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard
          key={f.path}
          file={f}
          commenting={commenting}
          focus={target && f.path === target.path ? { line: target.line, nonce: target.nonce } : undefined}
          onFocusHandled={target && f.path === target.path ? onTargetHandled : undefined}
        />
      ))}
    </div>
  );
}
