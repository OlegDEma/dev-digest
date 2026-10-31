import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  badge: (ok: boolean): CSSProperties => ({
    fontSize: 12,
    padding: "1px 8px",
    borderRadius: 10,
    color: ok ? "var(--ok)" : "var(--crit)",
    background: ok ? "var(--ok-bg)" : "var(--crit-bg)",
  }),
  spacer: { flex: 1 } satisfies CSSProperties,
  detail: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn)", marginTop: 6 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
