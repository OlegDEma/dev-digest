import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";

const createMutate = vi.fn();
let state: { data?: unknown; isPending: boolean; isError: boolean; error: Error | null };
let draftState: { error: Error | null };
const draftIds: Array<string | null | undefined> = [];
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: createMutate, ...state }),
  useEvalCaseDraft: (id: string | null | undefined) => {
    draftIds.push(id);
    return draftState;
  },
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgent: () => ({ data: { id: "ag1", name: "Security Reviewer" } }) }));
vi.mock("@/components/eval-case-editor", () => ({
  EvalCaseEditor: (p: {
    agent: { id: string; name: string };
    findingId: string;
    onClose: () => void;
    onSaved?: (c: unknown) => void;
  }) => (
    <div role="dialog" aria-label="case editor">
      <span>{`editor for ${p.findingId} / ${p.agent.name}`}</span>
      <button onClick={p.onClose}>close editor</button>
      <button onClick={() => p.onSaved?.({ id: "c9", expected: [{ kind: "must_find" }] })}>save in editor</button>
    </div>
  ),
}));

import { EvalCaseAction } from "./EvalCaseAction";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "t",
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: "2026-10-01T10:00:00Z",
  dismissed_at: null,
};

beforeEach(() => {
  state = { isPending: false, isError: false, error: null };
  draftState = { error: null };
  draftIds.length = 0;
});
afterEach(() => {
  cleanup();
  createMutate.mockReset();
});

const mount = (f = FINDING) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalCaseAction finding={f} agentId="ag1" />
    </NextIntlClientProvider>,
  );

describe("EvalCaseAction", () => {
  it("creates the case for a decided finding", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(createMutate).toHaveBeenCalledWith("f1");
  });

  it("is enabled on an undecided finding and opens the editor from its draft, creating nothing (AC-D34, AC-D35a)", () => {
    mount({ ...FINDING, accepted_at: null });
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    expect(screen.queryByText("Accept or dismiss first")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(btn);
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "case editor" })).toHaveTextContent("editor for f1 / Security Reviewer");
    expect(draftIds).toContain("f1");
    fireEvent.click(screen.getByRole("button", { name: "close editor" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirms a case saved through the editor with the created message and the Evals link (W3)", () => {
    mount({ ...FINDING, accepted_at: null });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "save in editor" }));
    fireEvent.click(screen.getByRole("button", { name: "close editor" }));
    expect(screen.getByRole("status")).toHaveTextContent("Eval case created (must_find)");
    expect(screen.getByRole("link", { name: "View in Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("does not fetch a draft before the button is clicked", () => {
    mount({ ...FINDING, accepted_at: null });
    expect(draftIds.every((id) => id == null)).toBe(true);
  });

  it("shows 'Already an eval case' with a link instead of the editor on 409 eval_case_exists (AC-D35c)", () => {
    draftState = { error: new ApiError("exists", 409, "eval_case_exists", { case_id: "c9" }) };
    mount({ ...FINDING, accepted_at: null });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Already an eval case");
    expect(screen.getByRole("link", { name: "View in Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("links to the agent's Evals tab after creating", () => {
    state = {
      data: { created: true, case: { expected: [{ kind: "must_find" }] } },
      isPending: false,
      isError: false,
      error: null,
    };
    mount();
    expect(screen.getByRole("link", { name: "View in Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("names the file on diff_unavailable", () => {
    state = { isPending: false, isError: true, error: new ApiError("x", 422, "diff_unavailable") };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Diff for src/a.ts is unavailable");
  });

  it("shows the server's eval_case_limit message as literal text", () => {
    state = { isPending: false, isError: true, error: new ApiError("Agent has 200 cases <b>max</b>", 422, "eval_case_limit") };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not create the eval case: Agent has 200 cases <b>max</b>");
  });
});
