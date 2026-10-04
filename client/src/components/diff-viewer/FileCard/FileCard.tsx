/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor, findingDot } from "../styles";
import type { CollapseSignal } from "../collapse";
import { partitionAnnotations, type DiffAnnotation, type DiffAnnotationApi } from "../annotations";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OffDiffFindings } from "../OffDiffFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Annotations anchored to a given parsed line (new side only). */
function annotationsForLine(ln: Line, matched: Map<string, DiffAnnotation[]>): DiffAnnotation[] {
  if (matched.size === 0 || (ln.kind !== "add" && ln.kind !== "ctx") || ln.newNo == null) return [];
  return matched.get(`RIGHT:${ln.newNo}`) ?? [];
}

export function FileCard({
  file,
  commenting,
  annotations,
  collapseSignal,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  collapseSignal?: CollapseSignal;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  // A host-driven "open/close all": each new version forces this file to the
  // signal's state; version 0 is the initial no-op, and per-file toggles still work.
  const signalVersion = collapseSignal?.version ?? 0;
  const signalOpen = collapseSignal?.open ?? true;
  React.useEffect(() => {
    if (signalVersion > 0) setOpen(signalOpen);
  }, [signalVersion, signalOpen]);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  const annotationItems = annotations?.items;
  const fileAnnotations = React.useMemo(
    () => (annotationItems ?? []).filter((a) => a.path === file.path),
    [annotationItems, file.path],
  );
  const { matched: matchedAnnotations, unmatched: offDiff } = React.useMemo(
    () => partitionAnnotations(fileAnnotations, renderedKeys),
    [fileAnnotations, renderedKeys],
  );

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {fileAnnotations.length > 0 && (
          <span
            role="img"
            aria-label={t("diffViewer.hasFindings", { count: fileAnnotations.length })}
            style={findingDot}
          />
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                annotations={annotationsForLine(ln, matchedAnnotations)}
                annotationApi={annotations}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations && annotations.show && (
            <OffDiffFindings items={offDiff} render={annotations.render} />
          )}
        </div>
      )}
    </div>
  );
}
