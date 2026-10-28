/** Document pane modes; labels come from `context.mode.*`. */
export const MODES = ["preview", "edit"] as const;
export type Mode = (typeof MODES)[number];

/** Server cap on one listing (the notice shows when the clone holds more). */
export const LISTING_CAP = 2000;

/** What Resync resets a clone to; interpolated into the tracked-file warning. */
export const RESYNC_TARGET = "origin/<default branch>";
