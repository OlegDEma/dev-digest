/* RoleGroup — one role's files under a sticky, collapsible header with the
   count of files that carry findings and a collapse/expand-all-files button.
   An empty group still renders its header ("0 files") but cannot be opened. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import {
  AUTO_EXPAND_MAX_LINES,
  DiffViewer,
  type DiffCommentApi,
  type DiffAnnotationApi,
  type CollapseSignal,
} from "@/components/diff-viewer";
import { ROLE_UI } from "../../constants";
import { s } from "./styles";

export function RoleGroup({
  role,
  files,
  findingFiles,
  findingCount,
  commenting,
  annotations,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files in this group with findings; null when no review has run yet. */
  findingFiles: number | null;
  /** Findings anchored to files in this group (for the counter's tooltip). */
  findingCount: number;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
}) {
  const t = useTranslations("prReview");
  const ui = ROLE_UI[role];
  const empty = files.length === 0;
  const [open, setOpen] = React.useState(ui.defaultOpen && !empty);
  // Seeded from what FileCard auto-expands (small files), so the first click always does something visible.
  const [signal, setSignal] = React.useState<CollapseSignal>(() => ({
    version: 0,
    open: files.some((f) => f.additions + f.deletions <= AUTO_EXPAND_MAX_LINES),
  }));
  const filesOpen = signal.open;
  const isOpen = open && !empty;

  const toggleAll = () => {
    setSignal((sg) => ({ version: sg.version + 1, open: !sg.open }));
    if (!open) setOpen(true);
  };

  const findingsLabel =
    findingFiles !== null && findingFiles > 0
      ? t("smartDiff.groupFindings", { files: findingFiles, findings: findingCount })
      : undefined;

  return (
    <div>
      <div style={s.header}>
        <button
          type="button"
          aria-expanded={isOpen}
          disabled={empty}
          onClick={() => setOpen((o) => !o)}
          style={s.toggle(empty)}
        >
          <Icon.ChevronRight size={13} style={s.chevron(isOpen)} />
          <span style={s.square(ui.color)} aria-hidden />
          <span style={s.label}>{t(ui.labelKey)}</span>
          <span style={s.description}>{t(ui.descriptionKey)}</span>
          <span style={s.right}>
            {findingFiles === null && <span>{t("smartDiff.reviewNotRun")}</span>}
            {findingsLabel && (
              <span style={s.findings} title={findingsLabel}>
                <span aria-hidden>● {findingFiles}</span>
                <span style={s.srOnly}>{findingsLabel}</span>
              </span>
            )}
            <span>{t("smartDiff.filesCount", { count: files.length })}</span>
          </span>
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={toggleAll}
          title={t(filesOpen ? "smartDiff.collapseAllFiles" : "smartDiff.expandAllFiles")}
          aria-label={t(filesOpen ? "smartDiff.collapseAllFiles" : "smartDiff.expandAllFiles")}
          style={s.collapseAll(empty)}
        >
          <Icon.ChevronsUpDown size={14} />
        </button>
      </div>
      {isOpen && (
        <div style={s.body}>
          <DiffViewer
            files={files}
            commenting={commenting}
            annotations={annotations}
            collapseSignal={signal}
          />
        </div>
      )}
    </div>
  );
}
