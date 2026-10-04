/* Finding annotations for the DiffViewer: generic, so the viewer never imports
   app code. The host supplies the items and a render(id) for the inline card. */
import type React from "react";
import type { Severity } from "@devdigest/ui";
import { SEVERITY_ORDER } from "../../lib/findings";
import { partitionByLineKey } from "./helpers";

/** One finding pinned to a new-side line of a file. */
export interface DiffAnnotation {
  id: string;
  path: string;
  line: number;
  severity: Severity;
}

export interface DiffAnnotationApi {
  items: DiffAnnotation[];
  /** When false, inline cards are hidden (bars, labels and dots always stay). */
  show: boolean;
  render: (id: string) => React.ReactNode;
}

/** Annotations only anchor to the new side (RIGHT) of the diff. */
export function annotationKey(a: DiffAnnotation): string {
  return `RIGHT:${a.line}`;
}

/** Most severe severity in a non-empty list. */
export function topSeverity(list: DiffAnnotation[]): Severity {
  const rank = (sev: Severity) => {
    const i = (SEVERITY_ORDER as readonly string[]).indexOf(sev);
    return i === -1 ? SEVERITY_ORDER.length : i;
  };
  return list.reduce((top, a) => (rank(a.severity) < rank(top) ? a.severity : top), list[0]!.severity);
}

export function partitionAnnotations(items: DiffAnnotation[], rendered: Set<string>) {
  return partitionByLineKey(items, annotationKey, rendered);
}
