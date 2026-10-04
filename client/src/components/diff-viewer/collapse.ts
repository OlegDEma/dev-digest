/* Host-driven open/close-all for the files of a DiffViewer. Bump `version` to
   force every FileCard to `open`; a version of 0 means "no signal yet". */
export interface CollapseSignal {
  version: number;
  open: boolean;
}
