import type { CSSProperties } from "react";
import { STATUS_COLOR } from "./constants";
import type { ConventionCandidate } from "@devdigest/shared";

/** Co-located styles for the Conventions board. */
export const s = {
  page: { padding: "22px 26px 60px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 6 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 650, margin: 0, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 620 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  summary: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: "14px 0 0",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "18px 0 14px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  toolbarSpacer: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 12, marginTop: 18 } satisfies CSSProperties,
} as const;

/** Card styles live with the card, but the status stripe is shared with the board. */
export const cardStyles = {
  card: (status: ConventionCandidate["status"]): CSSProperties => ({
    display: "flex",
    gap: 14,
    padding: "16px 18px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${STATUS_COLOR[status]}`,
    borderRadius: 10,
    opacity: status === "rejected" ? 0.55 : 1,
    transition: "opacity .2s ease",
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  ruleRow: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, fontStyle: "italic", margin: 0, lineHeight: 1.45 } satisfies CSSProperties,
  rationale: { fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px" } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evidenceLink: { color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  evidenceCode: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 11.5,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 12, marginTop: 12 } satisfies CSSProperties,
  metaLabel: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 140 } satisfies CSSProperties,
  pct: { fontSize: 11.5, color: "var(--text-secondary)", minWidth: 30 } satisfies CSSProperties,
  side: { display: "flex", flexDirection: "column", gap: 6, width: 132, flexShrink: 0 } satisfies CSSProperties,
  editField: {
    width: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    color: "var(--text-primary)",
    font: "inherit",
    fontSize: 13,
    padding: "7px 9px",
    marginBottom: 8,
  } satisfies CSSProperties,
} as const;
