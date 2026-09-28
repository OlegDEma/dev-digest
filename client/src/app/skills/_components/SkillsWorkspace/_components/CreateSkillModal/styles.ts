import type { CSSProperties } from "react";

/** Co-located styles for the Add-skill modal (shell + create / file / url panels). */
export const s = {
  // ---- shell / panels -------------------------------------------------------
  panel: { padding: "18px 24px 22px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  fields: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  primary: { marginTop: 4 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,

  // ---- file dropzone --------------------------------------------------------
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "36px 20px",
    borderRadius: 10,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-surface)",
    cursor: "pointer",
    textAlign: "center",
  } satisfies CSSProperties,
  dropIcon: { color: "var(--accent)" } satisfies CSSProperties,
  dropHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,

  // ---- url input ------------------------------------------------------------
  urlRow: { display: "flex", gap: 10, alignItems: "flex-start" } satisfies CSSProperties,
  urlGrow: { flex: 1 } satisfies CSSProperties,

  // ---- shared preview -------------------------------------------------------
  errorBox: {
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  previewHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } satisfies CSSProperties,
  bodyBox: {
    maxHeight: 240,
    overflow: "auto",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  memberList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  member: (flagged: boolean): CSSProperties => ({
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: flagged ? "var(--warn)" : "var(--text-muted)",
  }),
  more: { fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 } satisfies CSSProperties,
  warning: { fontSize: 12, color: "var(--warn)", display: "flex", gap: 6, alignItems: "flex-start" } satisfies CSSProperties,
  section: { marginTop: 4 } satisfies CSSProperties,
  resetRow: { display: "flex", justifyContent: "flex-start" } satisfies CSSProperties,
} as const;
