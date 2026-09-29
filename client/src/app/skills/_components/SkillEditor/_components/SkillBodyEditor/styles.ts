import type { CSSProperties } from "react";
import { FONT_SIZE, GUTTER_WIDTH, LINE_HEIGHT, MAX_HEIGHT, MIN_LINES, PAD_X, PAD_Y } from "./constants";
import type { LineKind } from "./helpers";

/** Shared text metrics — applied to BOTH the highlight layer and the textarea. */
const text: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  letterSpacing: 0,
  tabSize: 2,
  whiteSpace: "pre",
  padding: `${PAD_Y}px ${PAD_X + 8}px ${PAD_Y}px ${PAD_X}px`,
  margin: 0,
};

/** Co-located styles for SkillBodyEditor. */
export const s: {
  frame: CSSProperties;
  head: CSSProperties;
  headIcon: CSSProperties;
  fileName: CSSProperties;
  tokens: CSSProperties;
  body: CSSProperties;
  gutter: CSSProperties;
  lineNo: CSSProperties;
  editArea: CSSProperties;
  highlight: CSSProperties;
  placeholderLayer: CSSProperties;
  line: (kind: LineKind) => CSSProperties;
  textarea: CSSProperties;
} = {
  frame: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  headIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  fileName: { fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    display: "flex",
    alignItems: "stretch",
    overflow: "auto",
    maxHeight: MAX_HEIGHT,
    minHeight: MIN_LINES * LINE_HEIGHT + PAD_Y * 2,
    background: "var(--code-bg, var(--bg-primary))",
  } satisfies CSSProperties,
  gutter: {
    position: "sticky",
    left: 0,
    zIndex: 1,
    flexShrink: 0,
    width: GUTTER_WIDTH,
    padding: `${PAD_Y}px 0`,
    background: "var(--code-bg, var(--bg-primary))",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: FONT_SIZE - 1,
    lineHeight: `${LINE_HEIGHT}px`,
    textAlign: "right",
    userSelect: "none",
  } satisfies CSSProperties,
  lineNo: { paddingRight: 12 } satisfies CSSProperties,
  editArea: { position: "relative", flex: "1 0 auto" } satisfies CSSProperties,
  highlight: { ...text, pointerEvents: "none", color: "var(--text-primary)" } satisfies CSSProperties,
  placeholderLayer: { ...text, pointerEvents: "none", color: "var(--text-muted)" } satisfies CSSProperties,
  line: (kind: LineKind): CSSProperties => ({
    minHeight: LINE_HEIGHT,
    color: kind === "heading" ? "var(--accent-text)" : "inherit",
    fontWeight: kind === "heading" ? 600 : 400,
  }),
  textarea: {
    ...text,
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    boxSizing: "border-box",
    background: "transparent",
    color: "transparent",
    caretColor: "var(--text-primary)",
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
  } satisfies CSSProperties,
};
