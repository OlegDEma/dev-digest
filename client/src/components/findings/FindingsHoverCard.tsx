/* FindingsHoverCard — a hover/focus popover that lists a set of findings
   (title, category, file:line, confidence, rationale snippet). Shared by the PR
   timeline (findings passed in) and the PR list (lazily fetched on hover).

   There is no Popover primitive in @devdigest/ui, so this is net-new. The card is
   position:fixed and measured from the trigger so it escapes the PR-list table's
   `overflow:hidden`; it opens on hover/focus and closes on leave/blur/Escape/scroll.
   vendor/ui is do-not-touch, so it lives in the app tree. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

const CARD_WIDTH = 380;
const CLOSE_DELAY_MS = 100;

const clampRationale = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
  margin: 0,
} as React.CSSProperties;

const s = {
  wrap: { position: "relative", display: "inline-flex" } as React.CSSProperties,
  card: {
    position: "fixed",
    width: CARD_WIDTH,
    maxWidth: "calc(100vw - 16px)",
    maxHeight: 360,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    zIndex: 60,
    padding: 6,
    animation: "ddpop .12s ease-out",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px",
    borderTop: "1px solid var(--border)",
  } as React.CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as React.CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as React.CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } as React.CSSProperties,
  loading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 8px",
    fontSize: 12,
    color: "var(--text-muted)",
  } as React.CSSProperties,
};

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingsHoverCard({
  findings,
  loading,
  repoFullName,
  headSha,
  onOpenChange,
  children,
}: {
  findings: FindingRecord[];
  /** True while the caller is still fetching (PR-list lazy load). */
  loading?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Fires on open/close — lets a caller lazily fetch findings on first open. */
  onOpenChange?: (open: boolean) => void;
  /** The trigger (usually the <SeverityCounts> chips). */
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const doOpen = React.useCallback(() => {
    cancelClose();
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8));
      setPos({ top: r.bottom + 6, left });
    }
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  // Fixed positioning goes stale on scroll/resize — just close then.
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  // Report open/close so a caller can lazily fetch on first open.
  React.useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  return (
    <span
      ref={triggerRef}
      style={s.wrap}
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={open}
      onMouseEnter={doOpen}
      onMouseLeave={scheduleClose}
      onFocus={doOpen}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children}
      {open && (
        <div
          role="dialog"
          aria-label={t("timeline.findingsCount", { count: findings.length })}
          style={{ ...s.card, top: pos.top, left: pos.left }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          // The card can sit inside a click-to-navigate row (PR list) — keep
          // clicks (e.g. a file link) from bubbling up into row navigation.
          onClick={(e) => e.stopPropagation()}
        >
          <div style={s.header}>
            <Icon.Info size={13} />
            {t("timeline.findingsCount", { count: findings.length })}
          </div>

          {loading && findings.length === 0 ? (
            <div style={s.loading}>
              <Icon.RefreshCw size={13} style={{ animation: "ddspin 1s linear infinite" }} />
              {t("timeline.findingsLoading")}
            </div>
          ) : (
            findings.map((f) => {
              const href =
                repoFullName && headSha
                  ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
                  : undefined;
              return (
                <div key={f.id} style={s.row}>
                  <div style={s.titleRow}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.title}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={s.metaRow}>
                    <MonoLink href={href}>
                      {f.file}:{lineLabel(f)}
                    </MonoLink>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  {f.rationale && <p style={clampRationale}>{f.rationale}</p>}
                </div>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}
