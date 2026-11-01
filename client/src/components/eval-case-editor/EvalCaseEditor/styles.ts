import type { CSSProperties } from "react";

/** Co-located styles for the eval case editor shell. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  nameLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  inputLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  contextStatus: { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-surface)" } satisfies CSSProperties,
  tabPanel: { paddingTop: 12 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  runOnSave: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  runGroup: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  center: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  spin: { animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
  loadError: { padding: "24px", fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
};
