import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { makeCase } from "@/lib/test-support/eval-fixtures";
import {
  EMPTY_FORM,
  appendSkeleton,
  diffMessage,
  filesMessage,
  metaMessage,
  nameMessage,
  checkExpected,
  classifySaveError,
  formFromCase,
  isDirty,
  lineLabel,
  tabOfProblem,
} from "./helpers";

describe("isDirty", () => {
  it("is false for equal forms and true for any changed field", () => {
    const base = formFromCase(makeCase({ input_files: [{ path: "a", content: "b" }] }));
    expect(isDirty(base, formFromCase(makeCase({ input_files: [{ path: "a", content: "b" }] })))).toBe(false);
    expect(isDirty(base, { ...base, name: "x" })).toBe(true);
    expect(isDirty(base, { ...base, files: [{ path: "a", content: "c" }] })).toBe(true);
    expect(isDirty(base, { ...base, files: [] })).toBe(true);
    expect(isDirty(EMPTY_FORM, { ...EMPTY_FORM, prTitle: "t" })).toBe(true);
  });
});

describe("checkExpected", () => {
  it("accepts [] and fills the kind default", () => {
    expect(checkExpected("[]")).toEqual({ ok: true, items: [] });
    const r = checkExpected('[{"file":"a","start_line":1,"severity":"WARNING","category":"bug"}]');
    expect(r.ok && r.items[0]?.kind).toBe("must_find");
  });
  it("reports the JSON path of the first problem", () => {
    expect(checkExpected('[{"file":"a","start_line":1}]')).toMatchObject({ ok: false, path: "$[0].severity" });
    expect(checkExpected("{}")).toMatchObject({ ok: false, path: "$" });
  });
});

describe("appendSkeleton", () => {
  it("appends to a list and refuses non-arrays", () => {
    expect(JSON.parse(appendSkeleton("[]", "")!)).toHaveLength(1);
    expect(appendSkeleton("{", "")).toBeNull();
    expect(appendSkeleton("{}", "")).toBeNull();
  });
});

describe("classifySaveError / tabOfProblem", () => {
  it("maps API codes to problems", () => {
    expect(classifySaveError(new ApiError("m", 422, "invalid_name"))).toEqual({ kind: "name_invalid" });
    expect(classifySaveError(new ApiError("m", 409, "eval_case_name_taken"))).toEqual({ kind: "name_taken" });
    expect(classifySaveError(new ApiError("m", 422, "invalid_diff", { reason: "no_hunks", file: "f" }))).toEqual({
      kind: "diff",
      reason: "no_hunks",
      file: "f",
    });
    expect(classifySaveError(new ApiError("m", 422, "input_too_large", { limit: "file" }))).toEqual({ kind: "too_large", limit: "file" });
    expect(classifySaveError(new ApiError("m", 422, "duplicate_file_path", { path: "p" }))).toEqual({ kind: "duplicate_path", path: "p" });
    expect(classifySaveError(new ApiError("boom", 500))).toEqual({ kind: "other", message: "boom" });
    expect(classifySaveError(new Error("net"))).toEqual({ kind: "other", message: "net" });
  });
  it("sends each problem to its tab", () => {
    expect(tabOfProblem({ kind: "diff", reason: "no_files" })).toBe("diff");
    expect(tabOfProblem({ kind: "too_large", limit: "diff" })).toBe("diff");
    expect(tabOfProblem({ kind: "too_large", limit: "files_count" })).toBe("files");
    expect(tabOfProblem({ kind: "duplicate_path", path: "p" })).toBe("files");
    expect(tabOfProblem({ kind: "too_large", limit: "pr_title" })).toBe("meta");
    expect(tabOfProblem({ kind: "name_taken" })).toBeNull();
  });
});

describe("lineLabel", () => {
  it("shows a range only when end_line is past start_line", () => {
    expect(lineLabel({ start_line: 3 })).toBe("3");
    expect(lineLabel({ start_line: 3, end_line: 3 })).toBe("3");
    expect(lineLabel({ start_line: 3, end_line: 5 })).toBe("3-5");
  });
});

describe("problem message builders", () => {
  // Echo the key and values so the tests assert which message and parameters were chosen.
  const t = (key: string, v?: Record<string, string | number>) => (v ? `${key}|${JSON.stringify(v)}` : key);

  it("diffMessage: server reason, then diff limit, then local validation of a non-empty diff", () => {
    expect(diffMessage(t, { kind: "diff", reason: "no_hunks", file: "f" }, "", null)).toBe('caseEditor.invalidDiff.no_hunks|{"file":"f"}');
    expect(diffMessage(t, { kind: "too_large", limit: "diff" }, "", null)).toBe('caseEditor.tooLarge.diff|{"size":256}');
    expect(diffMessage(t, null, "x", { reason: "no_files" })).toBe('caseEditor.invalidDiff.no_files|{"file":""}');
    expect(diffMessage(t, null, "  ", { reason: "no_files" })).toBeNull();
    expect(diffMessage(t, { kind: "name_taken" }, "x", null)).toBeNull();
  });

  it("filesMessage: duplicate path and the three file limits only", () => {
    expect(filesMessage(t, { kind: "duplicate_path", path: "p" })).toBe('caseEditor.duplicatePath|{"path":"p"}');
    expect(filesMessage(t, { kind: "too_large", limit: "file" })).toBe('caseEditor.tooLarge.file|{"size":64}');
    expect(filesMessage(t, { kind: "too_large", limit: "files_total" })).toBe('caseEditor.tooLarge.files_total|{"size":256}');
    expect(filesMessage(t, { kind: "too_large", limit: "files_count" })).toBe('caseEditor.tooLarge.files_count|{"count":10}');
    expect(filesMessage(t, { kind: "too_large", limit: "diff" })).toBeNull();
    expect(filesMessage(t, null)).toBeNull();
  });

  it("metaMessage: only its own limit", () => {
    expect(metaMessage(t, { kind: "too_large", limit: "pr_title" }, "pr_title")).toBe('caseEditor.tooLarge.pr_title|{"count":200}');
    expect(metaMessage(t, { kind: "too_large", limit: "pr_description" }, "pr_description")).toBe(
      'caseEditor.tooLarge.pr_description|{"count":8000}',
    );
    expect(metaMessage(t, { kind: "too_large", limit: "pr_title" }, "pr_description")).toBeNull();
    expect(metaMessage(t, null, "pr_title")).toBeNull();
  });

  it("nameMessage: taken, invalid from server, locally invalid non-empty name, else none", () => {
    expect(nameMessage(t, { kind: "name_taken" }, "a", true)).toBe("caseEditor.nameTaken");
    expect(nameMessage(t, { kind: "name_invalid" }, "a", true)).toBe("caseEditor.nameInvalid");
    expect(nameMessage(t, null, "Bad", false)).toBe("caseEditor.nameInvalid");
    expect(nameMessage(t, null, "", false)).toBeNull();
    expect(nameMessage(t, null, "ok", true)).toBeNull();
  });
});
