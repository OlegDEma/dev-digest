import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";

const createMutate = vi.fn();
let createState: { data?: unknown; isPending: boolean; isError: boolean; error: Error | null };
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: createMutate, ...createState }),
  useEvalCaseDraft: () => ({ error: null }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgent: () => ({ data: { id: "ag1", name: "Security Reviewer" } }) }));
vi.mock("@/components/eval-case-editor", () => ({
  EvalCaseEditor: () => <div role="dialog" aria-label="case editor" />,
}));

import { FindingCard } from "./FindingCard";

beforeEach(() => {
  createState = { isPending: false, isError: false, error: null };
});
afterEach(() => {
  cleanup();
  createMutate.mockReset();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

const ACCEPTED: FindingRecord = { ...FINDING, accepted_at: "2026-10-01T10:00:00Z" };
const DISMISSED: FindingRecord = { ...FINDING, dismissed_at: "2026-10-01T10:00:00Z" };
const CASE = {
  id: "c1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "x",
  expected: [{ kind: "must_find", file: "src/config.ts", start_line: 11, end_line: 11 }],
};

describe("FindingCard: Turn into eval case", () => {
  it("is enabled while the finding is undecided and opens the editor (AC-D34, AC-D35a)", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded agentId="ag1" />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    expect(screen.queryByText("Accept or dismiss first")).toBeNull();
    fireEvent.click(btn);
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "case editor" })).toBeInTheDocument();
  });

  it("is enabled for accepted and dismissed findings and creates the case (AC-1, AC-2)", () => {
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    expect(screen.queryByText("Accept or dismiss first")).toBeNull();
    fireEvent.click(btn);
    expect(createMutate).toHaveBeenCalledWith("f1");
    cleanup();
    renderWithIntl(<FindingCard f={DISMISSED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });

  it("is disabled while the create request is pending (AC-11b)", () => {
    createState = { isPending: true, isError: false, error: null };
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
  });

  it("shows Accept, Dismiss, Turn into eval case in that order and no Learn / Reply (AC-D36)", () => {
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.queryByRole("button", { name: /learn/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reply/i })).toBeNull();
    const names = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    const accept = names.indexOf("Accept");
    const dismiss = names.indexOf("Dismiss");
    const evalIdx = names.indexOf("Turn into eval case");
    expect(accept).toBeGreaterThan(-1);
    expect(dismiss).toBeGreaterThan(accept);
    expect(evalIdx).toBeGreaterThan(dismiss);
  });

  it("is hidden without a producing agent (AC-13b)", () => {
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId={null} />);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).toBeNull();
    cleanup();
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded />);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).toBeNull();
  });

  it("confirms the created kind and links to the Evals tab (AC-12)", () => {
    createState = { data: { created: true, case: CASE }, isPending: false, isError: false, error: null };
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Eval case created (must_find)");
    expect(screen.getByRole("link", { name: "View in Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("names must_not_flag for a dismissed finding (AC-12)", () => {
    createState = {
      data: { created: true, case: { ...CASE, expected: [{ ...CASE.expected[0], kind: "must_not_flag" }] } },
      isPending: false,
      isError: false,
      error: null,
    };
    renderWithIntl(<FindingCard f={DISMISSED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("status")).toHaveTextContent("must_not_flag");
  });

  it("says 'Already an eval case' with a link when created is false (AC-7b)", () => {
    createState = { data: { created: false, case: CASE }, isPending: false, isError: false, error: null };
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Already an eval case");
    expect(screen.getByRole("link", { name: "View in Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
  });

  it("shows the diff-unavailable message naming the file on 422 (AC-8b)", () => {
    createState = {
      isPending: false,
      isError: true,
      error: new ApiError("Diff for src/config.ts is unavailable", 422, "diff_unavailable"),
    };
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded agentId="ag1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Diff for src/config.ts is unavailable — open the PR to refresh its files, then retry",
    );
  });

  it("renders a hostile title and server error as literal text (AC-64)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    createState = { isPending: false, isError: true, error: new ApiError(evil, 500, "boom") };
    const { container } = renderWithIntl(<FindingCard f={{ ...ACCEPTED, title: evil }} defaultExpanded agentId="ag1" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
  });
});
