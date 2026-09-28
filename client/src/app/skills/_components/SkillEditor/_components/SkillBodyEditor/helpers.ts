/** How a line is tinted in the highlight layer. Only headings get a colour —
    that is what the design shows; everything else stays plain. */
export type LineKind = "heading" | "text";

const HEADING = /^#{1,6}\s/;

export function classifyLine(line: string): LineKind {
  return HEADING.test(line) ? "heading" : "text";
}

/** Split the body into editor lines (an empty body is one empty line). */
export function splitLines(value: string): string[] {
  return value.split("\n");
}
