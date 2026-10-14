/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, FOCUS_FLASH_MS, FOCUS_SETTLE_MS } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

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

/** A deep-link request for this card (`nonce` makes a repeat of the same target fire again). */
export interface FileCardFocus {
  line: number | null;
  nonce: number;
}

export function FileCard({
  file,
  commenting,
  focus,
  onFocusHandled,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  focus?: FileCardFocus;
  onFocusHandled?: () => void;
}) {
  const t = useTranslations("shell");
  const tb = useTranslations("brief");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const headerRef = React.useRef<HTMLDivElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const flashTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = React.useRef(onFocusHandled);
  handledRef.current = onFocusHandled;
  // Line the deep link asked for but this diff does not render (AC-54).
  const [outsideLine, setOutsideLine] = React.useState<number | null>(null);

  React.useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const focusNonce = focus?.nonce;
  const focusLine = focus?.line ?? null;
  React.useEffect(() => {
    if (focusNonce === undefined) return;
    setOpen(true);
    setOutsideLine(null);
    // `open` just flipped — wait for the lines to mount before looking one up.
    const timer = setTimeout(() => {
      const el =
        focusLine == null
          ? null
          : Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-new-line]") ?? []).find(
              (n) => n.getAttribute("data-new-line") === String(focusLine),
            ) ?? null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "box-shadow .2s ease";
        el.style.boxShadow = "inset 0 0 0 2px var(--accent)";
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => {
          el.style.boxShadow = "";
        }, FOCUS_FLASH_MS);
      } else {
        headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (focusLine != null) setOutsideLine(focusLine);
      }
      handledRef.current?.();
    }, FOCUS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [focusNonce, focusLine]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div ref={headerRef} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
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
        <div ref={bodyRef} style={s.fileBody}>
          {outsideLine != null && (
            <div role="status" style={s.noDiff}>
              {tb("prBrief.lineOutside", { n: outsideLine })}
            </div>
          )}
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
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
