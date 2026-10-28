import type { CSSProperties } from "react";

export const s = {
  section: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-surface)", marginBottom: 14 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" } satisfies CSSProperties,
  h2: { margin: 0, fontSize: 16, fontWeight: 650, flex: 1, minWidth: 0, borderRadius: 4 } satisfies CSSProperties,
  toggle: { background: "none", border: 0, padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", display: "block", width: "100%" } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
  unavailable: { margin: 0, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
