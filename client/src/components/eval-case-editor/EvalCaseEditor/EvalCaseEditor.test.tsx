import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";
import { makeCase, makeRun } from "@/lib/test-support/eval-fixtures";

type Q = {
  data?: unknown;
  isLoading: boolean;
  isError: boolean;
  isLoadingError?: boolean;
  isSuccess?: boolean;
  error?: Error | null;
  refetch: () => void;
};
const ok = (data: unknown): Q => ({ data, isLoading: false, isError: false, isLoadingError: false, isSuccess: true, refetch: vi.fn() });

let casesState: Q;
let runsState: Q;
let draftState: Q;
const createMutate = vi.fn();
const updateMutate = vi.fn();
const startMutate = vi.fn();
let startPending = false;

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => casesState,
  useAgentEvalRuns: () => runsState,
  useEvalCaseDraft: () => draftState,
  useCreateEvalCase: () => ({ mutate: createMutate, isPending: false }),
  useUpdateEvalCase: () => ({ mutate: updateMutate, isPending: false }),
  useStartEvalRun: () => ({ mutate: startMutate, isPending: startPending }),
}));

import { EvalCaseEditor } from "./EvalCaseEditor";

const AGENT = { id: "ag1", name: "Security Reviewer" };
const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " const a = 1;",
  '+const key = "sk_live";',
  " export {};",
].join("\n");
const ITEM = '[{"kind":"must_find","file":"src/a.ts","start_line":2,"severity":"CRITICAL","category":"security"}]';
const EVIL = "<img src=x onerror=alert(1)>";

const CONTEXT = {
  files_included: 3,
  files_skipped: [{ path: "img.png", reason: "no_diff" }],
  files_unavailable: 0,
  pr_meta: "attached",
};

const onClose = vi.fn();
const onSaved = vi.fn();

beforeEach(() => {
  casesState = ok([]);
  runsState = ok([]);
  draftState = { isLoading: false, isError: false, refetch: vi.fn() };
  startPending = false;
});
afterEach(() => {
  cleanup();
  for (const m of [createMutate, updateMutate, startMutate, onClose, onSaved]) m.mockReset();
});

const mount = (props: { caseId?: string | null; findingId?: string | null } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseEditor agent={AGENT} onClose={onClose} onSaved={onSaved} {...props} />
    </NextIntlClientProvider>,
  );

const textbox = (name: string | RegExp) => screen.getByRole("textbox", { name });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const saveBtn = () => screen.getByRole("button", { name: "Save" });
const tab = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** Fill a valid case: name, diff, expected. */
function fillValid() {
  type(textbox(/^Name/), "my-case");
  type(textbox("Diff"), DIFF);
  type(textbox("Expected output"), ITEM);
}

const saved = (over: Partial<EvalCase> = {}) => makeCase({ id: "new1", name: "my-case", ...over });

describe("EvalCaseEditor: empty editor (AC-D1, AC-D2)", () => {
  it("opens empty with the spec's labels and buttons", () => {
    mount();
    expect(screen.getByText("Eval case · New")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(screen.getByText("Name *")).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    for (const n of ["Diff", "Files", "PR meta"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    expect(screen.getAllByText("Expected output").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Run on save")).not.toBeChecked();
    for (const n of ["Cancel", "Run case", "Save"]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    expect(textbox(/^Name/)).toHaveValue("");
    expect(textbox("Diff")).toHaveValue("");
    expect(textbox("Expected output")).toHaveValue("[]");
    tab("Files");
    expect(screen.queryAllByTestId("file-entry")).toHaveLength(0);
    tab("PR meta");
    expect(textbox(/Title/)).toHaveValue("");
    expect(textbox(/Body/)).toHaveValue("");
  });

  it("titles the dialog with the typed name", () => {
    mount();
    type(textbox(/^Name/), "stripe-key");
    expect(screen.getByText("Eval case · stripe-key")).toBeInTheDocument();
  });
});

describe("EvalCaseEditor: Diff tab (AC-D3)", () => {
  it("highlights + lines and @@ headers and keeps every prefix as text", () => {
    mount();
    type(textbox("Diff"), "@@ -1 +1 @@\n-old\n+new\n ctx");
    const preview = screen.getByTestId("diff-preview");
    const lines = [...preview.querySelectorAll("[data-line]")];
    expect(lines.map((l) => l.getAttribute("data-line"))).toEqual(["hunk", "plain", "add", "plain"]);
    expect(lines.map((l) => l.textContent)).toEqual(["@@ -1 +1 @@", "-old", "+new", " ctx"]);
  });
});

describe("EvalCaseEditor: Files and PR meta (AC-D4a, AC-D4b, AC-D4c)", () => {
  it("adds, edits and removes files; labels non-diff paths 'context only'", () => {
    mount();
    type(textbox("Diff"), DIFF);
    tab("Files");
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    type(screen.getByRole("textbox", { name: "File path" }), "src/a.ts");
    expect(screen.queryByText(/context only/)).toBeNull();
    type(screen.getByRole("textbox", { name: "File path" }), "src/helper.ts");
    expect(screen.getByText("context only — findings on this file are not scored")).toBeInTheDocument();
    type(screen.getByRole("textbox", { name: "File content" }), "export const x = 1;");
    expect(screen.getByRole("textbox", { name: "File content" })).toHaveValue("export const x = 1;");
    fireEvent.click(screen.getByRole("button", { name: "Remove file src/helper.ts" }));
    expect(screen.queryAllByTestId("file-entry")).toHaveLength(0);
  });

  it("sends files and PR meta with the save", () => {
    mount();
    fillValid();
    tab("Files");
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    type(screen.getByRole("textbox", { name: "File path" }), "src/helper.ts");
    type(screen.getByRole("textbox", { name: "File content" }), "x");
    tab("PR meta");
    type(textbox(/Title/), "Add Stripe");
    type(textbox(/Body/), "Wire payments");
    fireEvent.click(saveBtn());
    const body = createMutate.mock.calls[0]![0];
    expect(body.input_files).toEqual([{ path: "src/helper.ts", content: "x" }]);
    expect(body.pr_meta).toEqual({ title: "Add Stripe", description: "Wire payments" });
    expect(body.input_diff).toBe(DIFF);
    expect(body.name).toBe("my-case");
    expect(body.expected).toHaveLength(1);
  });

  it("blocks Save while a file has no path", () => {
    mount();
    fillValid();
    expect(saveBtn()).toBeEnabled();
    tab("Files");
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByText("Every file needs a path")).toBeInTheDocument();
  });
});

describe("EvalCaseEditor: expected output (AC-D5, AC-D6, EC-D33)", () => {
  it("shows 'valid JSON' for a valid list and 'invalid JSON · <path>' otherwise", () => {
    mount();
    expect(screen.getByTestId("json-badge")).toHaveTextContent("valid JSON");
    type(textbox("Expected output"), ITEM);
    expect(screen.getByTestId("json-badge")).toHaveTextContent("valid JSON");
    type(textbox("Expected output"), ITEM.replace("CRITICAL", "critical"));
    expect(screen.getByTestId("json-badge")).toHaveTextContent("invalid JSON · $[0].severity");
    type(textbox("Expected output"), ITEM.replace("}]", ',"bogus":1}]'));
    expect(screen.getByTestId("json-badge")).toHaveTextContent("invalid JSON · $[0].bogus");
    type(textbox("Expected output"), "[{");
    expect(screen.getByTestId("json-badge")).toHaveTextContent("invalid JSON · $");
  });

  it("appends a WARNING/bug skeleton on the diff's first file at line 1", () => {
    mount();
    type(textbox("Diff"), DIFF);
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse((textbox("Expected output") as HTMLTextAreaElement).value)).toEqual([
      { kind: "must_find", file: "src/a.ts", start_line: 1, severity: "WARNING", category: "bug", title: "" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse((textbox("Expected output") as HTMLTextAreaElement).value)).toHaveLength(2);
  });

  it("leaves file empty when the diff has none, and does nothing on unparseable text", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse((textbox("Expected output") as HTMLTextAreaElement).value)[0].file).toBe("");
    type(textbox("Expected output"), "[{");
    expect(screen.getByRole("button", { name: "+ Finding skeleton" })).toBeDisabled();
  });
});

describe("EvalCaseEditor: Save gating (AC-D7)", () => {
  it("keeps Save disabled until name, JSON and diff are all valid", () => {
    mount();
    expect(saveBtn()).toBeDisabled();
    type(textbox(/^Name/), "my-case");
    expect(saveBtn()).toBeDisabled(); // diff missing
    type(textbox("Diff"), DIFF);
    expect(saveBtn()).toBeEnabled();
    type(textbox("Expected output"), "{nope");
    expect(saveBtn()).toBeDisabled();
    type(textbox("Expected output"), ITEM);
    expect(saveBtn()).toBeEnabled();
    type(textbox(/^Name/), "Bad Name");
    expect(saveBtn()).toBeDisabled();
    expect(screen.getByText("Use 1–60 characters: a-z, 0-9 and hyphens")).toBeInTheDocument();
    type(textbox(/^Name/), "ok-name");
    type(textbox("Diff"), "@@ -1 +1 @@\n+x");
    expect(saveBtn()).toBeDisabled(); // missing_file_header
    expect(screen.getByText(/A hunk header \(@@\) comes before any/)).toBeInTheDocument();
    type(textbox("Diff"), "diff --git a/f b/f\n--- a/f\n+++ b/f");
    expect(saveBtn()).toBeDisabled(); // no_hunks
    expect(screen.getByText("No hunk found in f — add an @@ header")).toBeInTheDocument();
  });
});

describe("EvalCaseEditor: never-match warning (AC-D11)", () => {
  it("names the item and location but keeps Save enabled", () => {
    mount();
    fillValid();
    expect(screen.queryByText(/can never match/)).toBeNull();
    type(
      textbox("Expected output"),
      '[{"kind":"must_find","file":"src/other.ts","start_line":4,"end_line":6,"severity":"WARNING","category":"bug"}]',
    );
    expect(
      screen.getByText("Item 1 can never match — src/other.ts:4-6 is not on the new side of the diff"),
    ).toBeInTheDocument();
    expect(saveBtn()).toBeEnabled();
    type(
      textbox("Expected output"),
      '[{"kind":"must_find","file":"src/a.ts","start_line":99,"severity":"WARNING","category":"bug"}]',
    );
    expect(screen.getByText("Item 1 can never match — src/a.ts:99 is not on the new side of the diff")).toBeInTheDocument();
  });
});

describe("EvalCaseEditor: loading an existing case or a draft (AC-D9a, AC-D9b)", () => {
  it("shows a spinner while the case loads", () => {
    casesState = { isLoading: true, isError: false, refetch: vi.fn() };
    mount({ caseId: "c1" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("shows a spinner while a finding draft loads", () => {
    draftState = { isLoading: true, isError: false, refetch: vi.fn() };
    mount({ findingId: "f1" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("shows the load error with Close", () => {
    draftState = { isLoading: false, isError: true, isLoadingError: true, error: new ApiError("x", 500), refetch: vi.fn() };
    mount({ findingId: "f1" });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the eval case.");
    const labelled = screen.getAllByRole("button", { name: "Close" }).find((b) => b.textContent === "Close");
    fireEvent.click(labelled!);
    expect(onClose).toHaveBeenCalled();
  });

  it("explains diff_unavailable specifically (W2)", () => {
    draftState = { isLoading: false, isError: true, isLoadingError: true, error: new ApiError("raw", 422, "diff_unavailable"), refetch: vi.fn() };
    mount({ findingId: "f1" });
    expect(screen.getByRole("alert")).toHaveTextContent("The diff for this finding is unavailable — open the PR to refresh its files, then retry");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Could not load the eval case.");
  });

  it("falls back to the error's message for other load failures (W2)", () => {
    draftState = { isLoading: false, isError: true, isLoadingError: true, error: new ApiError("Server said no <b>", 500, "boom"), refetch: vi.fn() };
    mount({ findingId: "f1" });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the eval case.");
    expect(screen.getByRole("alert")).toHaveTextContent("Server said no <b>");
  });

  it("keeps the form and the typed edits when a background refetch of the cases fails", () => {
    casesState = ok([makeCase({ id: "c1", name: "stripe-key", input_diff: DIFF })]);
    const view = mount({ caseId: "c1" });
    type(textbox(/^Name/), "typed-edit");
    casesState = { data: casesState.data, isLoading: false, isError: true, isLoadingError: false, isSuccess: false, error: new ApiError("x", 500), refetch: vi.fn() };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalCaseEditor agent={AGENT} onClose={onClose} onSaved={onSaved} caseId="c1" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Could not load the eval case.")).toBeNull();
    expect(textbox(/^Name/)).toHaveValue("typed-edit");
  });

  it("keeps the form when the case disappears from the list after it was shown", () => {
    casesState = ok([makeCase({ id: "c1", name: "stripe-key", input_diff: DIFF })]);
    const view = mount({ caseId: "c1" });
    type(textbox(/^Name/), "typed-edit");
    casesState = ok([]);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalCaseEditor agent={AGENT} onClose={onClose} onSaved={onSaved} caseId="c1" />
      </NextIntlClientProvider>,
    );
    expect(textbox(/^Name/)).toHaveValue("typed-edit");
  });

  it("shows the load error when the case is not in the list", () => {
    casesState = ok([makeCase({ id: "other" })]);
    mount({ caseId: "c1" });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the eval case.");
  });

  it("loads an existing case into the form and saves it with an update, not a create", () => {
    casesState = ok([makeCase({ id: "c1", name: "stripe-key", input_diff: DIFF, revision: 2 })]);
    mount({ caseId: "c1" });
    expect(screen.getByText("Eval case · stripe-key")).toBeInTheDocument();
    expect(textbox(/^Name/)).toHaveValue("stripe-key");
    expect(textbox("Diff")).toHaveValue(DIFF);
    type(textbox(/^Name/), "renamed");
    fireEvent.click(saveBtn());
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate.mock.calls[0]![0].id).toBe("c1");
    expect(updateMutate.mock.calls[0]![0].body.name).toBe("renamed");
  });

  it("prefills from a finding draft and links the saved case to the finding (AC-D35a, AC-D35d)", () => {
    draftState = ok({
      name: "stripe-key-1",
      input_diff: DIFF,
      input_files: [],
      pr_meta: { title: "", description: "" },
      expected: JSON.parse(ITEM),
      context: CONTEXT,
    });
    mount({ findingId: "f1" });
    expect(textbox(/^Name/)).toHaveValue("stripe-key-1");
    expect(createMutate).not.toHaveBeenCalled();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    expect(createMutate.mock.calls[0]![0].source_finding_id).toBe("f1");
  });
});

describe("EvalCaseEditor: finding context summary (AC-R15, AC-R16)", () => {
  const draft = {
    name: "stripe-key-1",
    input_diff: DIFF,
    input_files: [{ path: "src/b.ts", content: "diff --git a/src/b.ts b/src/b.ts" }],
    pr_meta: { title: "T", description: "D" },
    expected: JSON.parse(ITEM),
    context: CONTEXT,
  };

  it("c3 shows the summary in a role=status region on a finding draft", () => {
    draftState = ok(draft);
    mount({ findingId: "f1" });
    const region = screen.getAllByRole("status").find((el) => /Context:/.test(el.textContent ?? ""));
    expect(region).toHaveTextContent("Context: 3 files from the PR · PR meta attached · 1 file skipped (limit)");
  });

  it("c3 shows no summary when editing an existing case", () => {
    casesState = ok([makeCase({ id: "c1", name: "stripe-key", input_diff: DIFF })]);
    draftState = ok(draft);
    mount({ caseId: "c1", findingId: "f1" });
    expect(screen.queryByText(/Context:/)).toBeNull();
  });

  it("c4 the saved body carries the prefilled Files and PR meta and never a context key", () => {
    draftState = ok(draft);
    mount({ findingId: "f1" });
    fireEvent.click(saveBtn());
    const body = createMutate.mock.calls[0]![0];
    expect(body.input_files).toEqual(draft.input_files);
    expect(body.pr_meta).toEqual(draft.pr_meta);
    expect("context" in body).toBe(false);
  });
});

describe("EvalCaseEditor: server errors (AC-D8f, AC-D10b, AC-D20b, EC-D15)", () => {
  const failWith = (err: ApiError) => createMutate.mockImplementation((_b, o) => o.onError(err));

  it("shows a reason-specific message under the Diff tab on invalid_diff", () => {
    mount();
    fillValid();
    failWith(new ApiError("bad", 422, "invalid_diff", { reason: "no_hunks", file: "src/a.ts" }));
    tab("PR meta");
    fireEvent.click(saveBtn());
    expect(screen.getByRole("alert")).toHaveTextContent("No hunk found in src/a.ts — add an @@ header");
    expect(textbox("Diff")).toHaveValue(DIFF);
  });

  it.each([
    ["no_files", /No file found in the diff/],
    ["missing_file_header", /A hunk header \(@@\) comes before/],
    ["ambiguous_multi_file", /Several files without/],
  ])("maps invalid_diff reason %s", (reason, re) => {
    mount();
    fillValid();
    failWith(new ApiError("bad", 422, "invalid_diff", { reason }));
    fireEvent.click(saveBtn());
    expect(screen.getByRole("alert")).toHaveTextContent(re);
  });

  it.each([
    ["diff", "The diff is over the 256 KB limit"],
    ["file", "A file is over the 64 KB limit"],
    ["files_total", "The files together are over the 256 KB limit"],
    ["files_count", "At most 10 files are allowed"],
    ["pr_title", "The PR title is over 200 characters"],
    ["pr_description", "The PR description is over 8000 characters"],
  ])("shows the %s limit beside its input and switches to that tab", (limit, text) => {
    mount();
    fillValid();
    failWith(new ApiError("big", 422, "input_too_large", { limit }));
    fireEvent.click(saveBtn());
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(saveBtn()).toBeEnabled();
  });

  it("keeps the input and shows the error for a name conflict and for other failures", () => {
    mount();
    fillValid();
    failWith(new ApiError("taken", 409, "eval_case_name_taken"));
    fireEvent.click(saveBtn());
    expect(screen.getByText("Another case of this agent already uses this name")).toBeInTheDocument();
    expect(textbox(/^Name/)).toHaveValue("my-case");
    expect(onClose).not.toHaveBeenCalled();
    failWith(new ApiError("kaboom", 500, "boom"));
    fireEvent.click(saveBtn());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the case: kaboom");
    expect(textbox("Diff")).toHaveValue(DIFF);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("EvalCaseEditor: closing (AC-D18, AC-D19)", () => {
  it("Cancel, × and Escape close a clean editor", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("asks before discarding unsaved changes; Keep editing keeps them", () => {
    mount();
    type(textbox(/^Name/), "edited");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByText("Discard unsaved changes?").closest("[role=dialog]") as HTMLElement;
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(textbox(/^Name/)).toHaveValue("edited");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Discard closes the editor", () => {
    mount();
    type(textbox("Diff"), "x");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape inside the discard dialog dismisses only the dialog", () => {
    mount();
    type(textbox("Diff"), "x");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps Tab inside the topmost dialog", () => {
    mount();
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const last = buttons[buttons.length - 1]!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).not.toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe("EvalCaseEditor: result strip (AC-D23, AC-D31, AC-D32)", () => {
  const result = (over: object) => ({
    run_id: "r1",
    status: "pass" as const,
    ran_at: "2026-10-01T10:00:00Z",
    summary: "expected 1 finding, got 1",
    duration_ms: 2400,
    cost_usd: 0.0123,
    case_revision: 1,
    ...over,
  });
  const strip = () => screen.getByTestId("result-strip");
  const open = (last: unknown, extra: Partial<EvalCase> = {}) => {
    casesState = ok([makeCase({ id: "c1", input_diff: DIFF, last_result: last as EvalCase["last_result"], ...extra })]);
    mount({ caseId: "c1" });
  };

  it("shows 'Never run' for a new or unrun case", () => {
    mount();
    expect(strip()).toHaveTextContent("Never run");
  });

  it("shows passed / failed with summary, duration and cost", () => {
    open(result({}));
    expect(strip()).toHaveTextContent("Last run passed · expected 1 finding, got 1 · 2.4s · $0.01");
    cleanup();
    open(result({ status: "fail", summary: "expected 1 finding, got 0" }));
    expect(strip()).toHaveTextContent("Last run failed · expected 1 finding, got 0 · 2.4s · $0.01");
  });

  it("shows '—' for an unknown cost", () => {
    open(result({ cost_usd: null }));
    expect(strip()).toHaveTextContent("2.4s · —");
  });

  it("shows the error message for an errored run", () => {
    open(result({ status: "error", summary: "diff has no reviewable files" }));
    expect(strip()).toHaveTextContent("Last run errored · diff has no reviewable files");
  });

  it("adds 'edited since last run' only when the result is older than the revision", () => {
    open(result({ case_revision: 1 }), { revision: 2 });
    expect(strip()).toHaveTextContent("edited since last run");
    cleanup();
    open(result({ case_revision: 2 }), { revision: 2 });
    expect(strip()).not.toHaveTextContent("edited since last run");
  });

  it("shows 'Running…' while a run of this case is in progress", () => {
    runsState = ok([makeRun({ status: "running", scope: "case", case_ids: ["c1"] })]);
    open(result({}));
    expect(strip()).toHaveTextContent("Running…");
    expect(strip()).not.toHaveTextContent("Last run passed");
  });
});

describe("EvalCaseEditor: running the case (AC-D25, AC-D30, AC-D33a-c)", () => {
  const openSaved = () => {
    casesState = ok([makeCase({ id: "c1", name: "stripe-key", input_diff: DIFF })]);
    mount({ caseId: "c1" });
  };

  it("Run case starts a scope-case run for the saved case", () => {
    openSaved();
    const btn = screen.getByRole("button", { name: "Run case" });
    expect(btn).toBeEnabled();
    expect(screen.queryByText("Save first")).toBeNull();
    fireEvent.click(btn);
    expect(startMutate.mock.calls[0]![0]).toEqual({ case_id: "c1" });
  });

  it("disables Run case with 'Save first' while the editor is dirty, and for an unsaved new case", () => {
    openSaved();
    type(textbox(/^Name/), "renamed");
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByText("Save first")).toBeInTheDocument();
    cleanup();
    mount();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByText("Save first")).toBeInTheDocument();
  });

  it.each(["running", "queued"] as const)("disables Run case while any run of the agent is %s", (status) => {
    runsState = ok([makeRun({ status, scope: "all", case_ids: ["other"] })]);
    openSaved();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("shows a rejected run in the strip", () => {
    startMutate.mockImplementation((_b, o) => o.onError(new ApiError("Run already in progress", 409, "eval_run_in_progress")));
    openSaved();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    expect(screen.getByTestId("result-strip")).toHaveTextContent("Could not run the case: Run already in progress");
  });

  it("a plain Save closes the editor and starts no run", () => {
    createMutate.mockImplementation((_b, o) => o.onSuccess(saved()));
    mount();
    fillValid();
    fireEvent.click(saveBtn());
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "new1" }));
    expect(startMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Run on save saves, then starts a case run and keeps the editor open (AC-D33b)", () => {
    createMutate.mockImplementation((_b, o) => o.onSuccess(saved()));
    mount();
    fillValid();
    fireEvent.click(screen.getByLabelText("Run on save"));
    fireEvent.click(saveBtn());
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(startMutate.mock.calls[0]![0]).toEqual({ case_id: "new1" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the case saved and shows the run error when the run is rejected (AC-D33c)", () => {
    createMutate.mockImplementation((_b, o) => o.onSuccess(saved()));
    startMutate.mockImplementation((_b, o) => o.onError(new ApiError("No API key configured", 422, "provider_not_configured")));
    mount();
    fillValid();
    fireEvent.click(screen.getByLabelText("Run on save"));
    fireEvent.click(saveBtn());
    expect(screen.getByTestId("result-strip")).toHaveTextContent("Could not run the case: No API key configured");
    expect(onClose).not.toHaveBeenCalled();
    // saved: the editor is clean and further saves update that case
    expect(screen.getByText("Eval case · my-case")).toBeInTheDocument();
    type(textbox(/^Name/), "my-case-2");
    fireEvent.click(saveBtn());
    expect(updateMutate.mock.calls[0]![0].id).toBe("new1");
  });
});

describe("EvalCaseEditor: user text is plain text (AC-D95)", () => {
  it("renders markup in name, diff, files, PR meta and JSON as literal text", () => {
    const { container } = mount();
    type(textbox(/^Name/), EVIL);
    type(textbox("Diff"), `@@ -1 +1 @@\n+${EVIL}`);
    tab("Files");
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    type(screen.getByRole("textbox", { name: "File path" }), EVIL);
    type(screen.getByRole("textbox", { name: "File content" }), EVIL);
    tab("PR meta");
    type(textbox(/Title/), EVIL);
    type(textbox(/Body/), EVIL);
    type(textbox("Expected output"), `["${EVIL}`);
    tab("Diff");
    expect(container.ownerDocument.querySelector("img")).toBeNull();
    expect(screen.getByText(`+${EVIL}`)).toBeInTheDocument();
    expect(screen.getByText(`Eval case · ${EVIL}`)).toBeInTheDocument();
  });

  it("renders a hostile server error and last result as text", () => {
    casesState = ok([
      makeCase({
        id: "c1",
        input_diff: DIFF,
        last_result: { run_id: "r", status: "error", ran_at: "2026-10-01T10:00:00Z", summary: EVIL, duration_ms: null, cost_usd: null, case_revision: 1 },
      }),
    ]);
    updateMutate.mockImplementation((_b, o) => o.onError(new ApiError(EVIL, 500, "boom")));
    mount({ caseId: "c1" });
    type(textbox(/^Name/), "x");
    fireEvent.click(saveBtn());
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByText(EVIL, { exact: false }).length).toBeGreaterThan(0);
  });
});

describe("EvalCaseEditor: focus (W4)", () => {
  const mountWithOpener = () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const view = mount();
    return { opener, view };
  };

  it("moves focus to the name input on open and restores the opener on close", () => {
    const { opener, view } = mountWithOpener();
    expect(document.activeElement).toBe(textbox(/^Name/));
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("focuses inside the dialog while loading", () => {
    casesState = { isLoading: true, isError: false, refetch: vi.fn() };
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    mount({ caseId: "c1" });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    opener.remove();
  });

  it("moves focus into the discard dialog when it opens", () => {
    mount();
    type(textbox(/^Name/), "x");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs[dialogs.length - 1]!.contains(document.activeElement)).toBe(true);
  });
});
