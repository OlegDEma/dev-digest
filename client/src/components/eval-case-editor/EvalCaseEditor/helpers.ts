/* Pure helpers of the eval case editor: form shape, dirty check, expected-output
   parsing, the "+ Finding skeleton" item and server-error classification. */
import {
  EVAL_INPUT_LIMITS,
  EvalExpectedList,
  firstDiffFile,
  jsonPathOf,
  type EvalCase,
  type EvalCaseDraft,
  type EvalCaseDraftBody,
  type EvalCaseInputFile,
  type EvalDiffInvalidReason,
  type EvalDiffProblem,
  type EvalExpectedItem,
  type EvalInputLimit,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export interface EditorForm {
  name: string;
  diff: string;
  files: EvalCaseInputFile[];
  prTitle: string;
  prDescription: string;
  /** The expected-output textarea, verbatim (may be invalid JSON while typing). */
  expectedText: string;
}

export type EditorTab = "diff" | "files" | "meta";

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export const EMPTY_FORM: EditorForm = {
  name: "",
  diff: "",
  files: [],
  prTitle: "",
  prDescription: "",
  expectedText: "[]",
};

export function formFromCase(c: EvalCase): EditorForm {
  return {
    name: c.name,
    diff: c.input_diff,
    files: c.input_files.map((f) => ({ ...f })),
    prTitle: c.pr_meta.title,
    prDescription: c.pr_meta.description,
    expectedText: pretty(c.expected),
  };
}

export function formFromDraft(d: EvalCaseDraft): EditorForm {
  return {
    name: d.name,
    diff: d.input_diff,
    files: d.input_files.map((f) => ({ ...f })),
    prTitle: d.pr_meta.title,
    prDescription: d.pr_meta.description,
    expectedText: pretty(d.expected),
  };
}

export function isDirty(a: EditorForm, b: EditorForm): boolean {
  return (
    a.name !== b.name ||
    a.diff !== b.diff ||
    a.prTitle !== b.prTitle ||
    a.prDescription !== b.prDescription ||
    a.expectedText !== b.expectedText ||
    a.files.length !== b.files.length ||
    a.files.some((f, i) => f.path !== b.files[i]?.path || f.content !== b.files[i]?.content)
  );
}

export type ExpectedCheck =
  | { ok: true; items: EvalExpectedItem[] }
  | { ok: false; path: string; message: string };

/** Parse the expected-output text and validate it against `EvalExpectedItem[]`; the first error carries its JSON path. */
export function checkExpected(text: string): ExpectedCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, path: "$", message: e instanceof Error ? e.message : "not JSON" };
  }
  const parsed = EvalExpectedList.safeParse(raw);
  if (parsed.success) return { ok: true, items: parsed.data };
  const issue = parsed.error.issues[0]!;
  const path = [...issue.path];
  if (issue.code === "unrecognized_keys" && issue.keys.length > 0) path.push(issue.keys[0]!);
  return { ok: false, path: jsonPathOf(path), message: issue.message };
}

/** The item "+ Finding skeleton" appends (Q-D3). */
export function skeletonItem(diff: string): EvalExpectedItem {
  return {
    kind: "must_find",
    file: firstDiffFile(diff),
    start_line: 1,
    severity: "WARNING",
    category: "bug",
    title: "",
  };
}

/** Append the skeleton to the list in `text`; null when `text` is not a JSON array (nothing to append to). */
export function appendSkeleton(text: string, diff: string): string | null {
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  return pretty([...list, skeletonItem(diff)]);
}

export function toBody(form: EditorForm, expected: EvalExpectedItem[]): EvalCaseDraftBody {
  return {
    name: form.name,
    input_diff: form.diff,
    input_files: form.files.map((f) => ({ path: f.path, content: f.content })),
    pr_meta: { title: form.prTitle, description: form.prDescription },
    expected,
  };
}

export function lineLabel(item: { start_line: number; end_line?: number | undefined }): string {
  return item.end_line !== undefined && item.end_line > item.start_line
    ? `${item.start_line}-${item.end_line}`
    : String(item.start_line);
}

/** A rejected save, reduced to what the editor can place next to an input. */
export type SaveProblem =
  | { kind: "name_invalid" }
  | { kind: "name_taken" }
  | { kind: "diff"; reason: EvalDiffInvalidReason; file?: string }
  | { kind: "too_large"; limit: EvalInputLimit }
  | { kind: "duplicate_path"; path: string }
  | { kind: "other"; message: string };

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

export function classifySaveError(err: unknown): SaveProblem {
  if (!(err instanceof ApiError)) return { kind: "other", message: err instanceof Error ? err.message : String(err) };
  const d = asRecord(err.details);
  switch (err.code) {
    case "invalid_name":
      return { kind: "name_invalid" };
    case "eval_case_name_taken":
      return { kind: "name_taken" };
    case "invalid_diff":
      return {
        kind: "diff",
        reason: d.reason as EvalDiffInvalidReason,
        ...(typeof d.file === "string" ? { file: d.file } : {}),
      };
    case "input_too_large":
      return { kind: "too_large", limit: d.limit as EvalInputLimit };
    case "duplicate_file_path":
      return { kind: "duplicate_path", path: typeof d.path === "string" ? d.path : "" };
    default:
      return { kind: "other", message: err.message };
  }
}

/** The tab a problem belongs to, so the editor can bring it into view. */
export function tabOfProblem(p: SaveProblem): EditorTab | null {
  if (p.kind === "diff") return "diff";
  if (p.kind === "duplicate_path") return "files";
  if (p.kind === "too_large") {
    if (p.limit === "diff") return "diff";
    return p.limit === "pr_title" || p.limit === "pr_description" ? "meta" : "files";
  }
  return null;
}

/** A translator as the message builders need it (next-intl's `t` fits). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

const KB = 1024;
const L = EVAL_INPUT_LIMITS;

/** Message under the Diff tab: the server's answer first, then the local validation of a non-empty diff. */
export function diffMessage(
  t: Translate,
  problem: SaveProblem | null,
  diff: string,
  diffProblem: EvalDiffProblem | null,
): string | null {
  if (problem?.kind === "diff") {
    return t(`caseEditor.invalidDiff.${problem.reason}`, { file: problem.file ?? "" });
  }
  if (problem?.kind === "too_large" && problem.limit === "diff") {
    return t("caseEditor.tooLarge.diff", { size: L.diffBytes / KB });
  }
  if (diff.trim() && diffProblem) {
    return t(`caseEditor.invalidDiff.${diffProblem.reason}`, { file: diffProblem.file ?? "" });
  }
  return null;
}

export function filesMessage(t: Translate, problem: SaveProblem | null): string | null {
  if (problem?.kind === "duplicate_path") return t("caseEditor.duplicatePath", { path: problem.path });
  if (problem?.kind !== "too_large") return null;
  if (problem.limit === "file") return t("caseEditor.tooLarge.file", { size: L.fileBytes / KB });
  if (problem.limit === "files_total") return t("caseEditor.tooLarge.files_total", { size: L.filesTotalBytes / KB });
  if (problem.limit === "files_count") return t("caseEditor.tooLarge.files_count", { count: L.filesCount });
  return null;
}

export function metaMessage(
  t: Translate,
  problem: SaveProblem | null,
  limit: "pr_title" | "pr_description",
): string | null {
  if (problem?.kind !== "too_large" || problem.limit !== limit) return null;
  return t(`caseEditor.tooLarge.${limit}`, { count: limit === "pr_title" ? L.prTitleChars : L.prDescriptionChars });
}

export function nameMessage(t: Translate, problem: SaveProblem | null, name: string, nameValid: boolean): string | null {
  if (problem?.kind === "name_taken") return t("caseEditor.nameTaken");
  if (problem?.kind === "name_invalid" || (name !== "" && !nameValid)) return t("caseEditor.nameInvalid");
  return null;
}
