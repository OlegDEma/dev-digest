import type { CSSProperties } from "react";

const box = (background: string, border: string, color: string): CSSProperties => ({
  fontSize: 13.5,
  padding: "10px 14px",
  borderRadius: 8,
  margin: "0 0 12px",
  lineHeight: 1.5,
  background,
  border: `1px solid ${border}`,
  color,
});

export const s: Record<"skeleton" | "failure" | "notice", CSSProperties> = {
  skeleton: box("var(--bg-elevated)", "var(--border-strong)", "var(--text-primary)"),
  failure: box("var(--crit-bg)", "var(--crit)", "var(--text-primary)"),
  notice: box("var(--bg-surface)", "var(--border)", "var(--text-secondary)"),
};
