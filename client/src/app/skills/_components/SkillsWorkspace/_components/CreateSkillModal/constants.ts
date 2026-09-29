/** Constants for the Add-skill modal (Create · From file · Import from URL). */

/** Modal width (px). */
export const MODAL_WIDTH = 720;

/** Rows for the body textarea in the create tab (the editor tab has the full editor). */
export const BODY_ROWS = 8;

/** Tab keys, in the design's order. */
export const ADD_TABS = ["create", "file", "url"] as const;
export type AddTabKey = (typeof ADD_TABS)[number];
export const DEFAULT_ADD_TAB: AddTabKey = "create";

/** `accept` attribute for the file picker — what the server knows how to parse. */
export const ACCEPTED_EXTENSIONS = ".md,.markdown,.zip";

/** Client-side size guard (mirrors the server's MAX_UPLOAD_BYTES). */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Ignored-member list is collapsed past this many rows. */
export const IGNORED_PREVIEW_ROWS = 8;
