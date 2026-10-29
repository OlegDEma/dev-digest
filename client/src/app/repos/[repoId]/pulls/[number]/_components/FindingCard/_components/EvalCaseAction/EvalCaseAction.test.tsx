import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";

const createMutate = vi.fn();
let state: { data?: unknown; isPending: boolean; isError: boolean; error: Error | null };
vi.mock("@/lib/hooks/evals", () => ({ useCreateEvalCase: () => ({ mutate: createMutate, ...state }) }));

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

  it("is disabled with a hint while undecided", () => {
    mount({ ...FINDING, accepted_at: null });
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
    expect(screen.getByText("Accept or dismiss first")).toBeInTheDocument();
  });

  it("links to the agent's Evals tab after creating", () => {
    state = {
      data: { created: true, case: { expectation: { kind: "must_find" } } },
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
