import { EDITOR_TABS, type EditorTabKey } from "../../constants";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: EditorTabKey;
  labelKey: string;
}

/** Tab bar, in the design's order (plain labels). Evals + Versions are placeholders for now. */
export const TABS: readonly EditorTab[] = EDITOR_TABS.map((key) => ({
  key,
  labelKey: `editor.tabs.${key}`,
}));
