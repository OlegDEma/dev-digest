import type { BriefDropped, BriefModelOutput, ReviewFocusItem, Risk } from '@devdigest/shared';
import { MAX_FOCUS, MAX_RISKS } from './constants.js';
import type { BriefRange } from './types.js';

export interface BriefValidationFacts {
  /** Every changed file → its new-side hunk ranges (empty array = changed but no known ranges). */
  changedRanges: ReadonlyMap<string, readonly BriefRange[]>;
  /** Blast-map caller files → their caller lines. */
  callerLines: ReadonlyMap<string, readonly number[]>;
}

export interface BriefValidation {
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  dropped: BriefDropped;
  corrected_lines: number;
}

const REF_RE = /^(.+?):(\d+)(?:-(\d+))?$/;

/** Path of a `path`, `path:line` or `path:start-end` ref. Only the path is ever validated. */
export function refPath(ref: string): string {
  const m = REF_RE.exec(ref);
  return m ? m[1]! : ref;
}

const lastLine = (r: BriefRange) => r.start + r.count - 1;

/** Nearest range by interval distance (0 inside); ties → earlier range. */
function nearestRange(line: number, ranges: readonly BriefRange[]): BriefRange {
  let best = ranges[0]!;
  let bestD = Infinity;
  for (const r of ranges) {
    const d = line < r.start ? r.start - line : line > lastLine(r) ? line - lastLine(r) : 0;
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** Nearest caller line; ties → the smaller line. */
function nearestCallerLine(line: number, lines: readonly number[]): number {
  let best = lines[0]!;
  for (const c of lines) {
    const d = Math.abs(c - line);
    const bd = Math.abs(best - line);
    if (d < bd || (d === bd && c < best)) best = c;
  }
  return best;
}

/**
 * Deterministic gate on the model's answer. Model-supplied paths are only ever
 * used as Map keys here — they never reach any I/O.
 */
export function validateBriefOutput(output: BriefModelOutput, facts: BriefValidationFacts): BriefValidation {
  const dropped: BriefDropped = { risks: 0, risk_refs: 0, review_focus: 0 };
  let corrected = 0;

  const knownFile = (p: string) => facts.changedRanges.has(p) || facts.callerLines.has(p);

  const risks: Risk[] = [];
  for (const risk of output.risks) {
    const refs = risk.file_refs.filter((r) => knownFile(refPath(r)));
    dropped.risk_refs += risk.file_refs.length - refs.length;
    if (refs.length === 0) {
      dropped.risks++;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }

  const focus: ReviewFocusItem[] = [];
  for (const item of output.review_focus) {
    const changed = facts.changedRanges.get(item.file);
    if (changed) {
      const ranges = changed.filter((r) => r.count > 0);
      if (ranges.length === 0) {
        dropped.review_focus++;
        continue;
      }
      const inside = item.line >= 1 && ranges.some((r) => item.line >= r.start && item.line <= lastLine(r));
      if (inside) {
        focus.push({ ...item, source: 'pr_diff', line_corrected: false });
      } else {
        corrected++;
        focus.push({ ...item, line: nearestRange(item.line, ranges).start, source: 'pr_diff', line_corrected: true });
      }
      continue;
    }
    const lines = facts.callerLines.get(item.file);
    if (lines && lines.length > 0) {
      if (lines.includes(item.line)) {
        focus.push({ ...item, source: 'blast_map', line_corrected: false });
      } else {
        corrected++;
        focus.push({ ...item, line: nearestCallerLine(item.line, lines), source: 'blast_map', line_corrected: true });
      }
      continue;
    }
    dropped.review_focus++;
  }

  // Caps cut overflow silently; `dropped` counts validation drops only.
  const keptFocus = focus.slice(0, MAX_FOCUS);
  return {
    risks: risks.slice(0, MAX_RISKS),
    review_focus: keptFocus,
    dropped,
    corrected_lines: keptFocus.filter((f) => f.line_corrected).length,
  };
}
