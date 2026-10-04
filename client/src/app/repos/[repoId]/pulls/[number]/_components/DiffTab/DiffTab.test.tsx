import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const mutate = vi.fn();
const state: { reviews: ReviewRecord[]; smart: SmartDiff | undefined; loading: boolean; error: boolean } = {
  reviews: [],
  smart: undefined,
  loading: false,
  error: false,
};

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: state.reviews }),
  useSmartDiff: () => ({ data: state.smart, isLoading: state.loading, isError: state.error }),
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

const PATCH = "@@ -1,2 +1,3 @@\n one\n+two\n three";
const file = (path: string, patch: string | null = PATCH): PrFile => ({ path, additions: 1, deletions: 0, patch });
// pr.files in GitHub order
const FILES = [file("README.md"), file("src/a.ts"), file("pnpm-lock.yaml"), file("src/a.test.ts")];

const SMART: SmartDiff = {
  groups: [
    ["core", ["src/a.ts"]],
    ["tests", ["src/a.test.ts"]],
    ["docs", ["README.md"]],
    ["boilerplate", ["pnpm-lock.yaml"]],
  ].map(([role, paths]) => ({
    role: role as SmartDiff["groups"][number]["role"],
    files: (paths as string[]).map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
  })),
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const REVIEW = {
  id: "r1",
  agent_id: "a1",
  kind: "review",
  created_at: "2026-01-01T00:00:00Z",
  findings: [FINDING],
} as unknown as ReviewRecord;

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab
        prId="pr1"
        filesCount={4}
        files={FILES}
        canComment
        additions={4}
        deletions={0}
        repoFullName="acme/x"
        headSha="abc1234"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  state.reviews = [REVIEW];
  state.smart = SMART;
  state.loading = false;
  state.error = false;
});

const open = (label: string) => fireEvent.click(screen.getByText(label).closest("button")!);

describe("DiffTab", () => {
  it("renders all five groups in order, all collapsed, empty one disabled", () => {
    setup();
    const labels = ["Core logic", "Tests", "Wiring", "Docs", "Boilerplate"];
    const nodes = labels.map((l) => screen.getByText(l).closest("button")!);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    nodes.forEach((n) => expect(n).toHaveAttribute("aria-expanded", "false"));
    expect(nodes[2]).toBeDisabled();
    expect(screen.getByText("0 files")).toBeInTheDocument();
  });

  it("shows the group count with its tooltip, and the file dot once Core is opened", () => {
    setup();
    expect(screen.getByText("● 1").parentElement).toHaveAttribute("title", "1 file with findings · 1 finding");
    open("Core logic");
    expect(screen.getByRole("img", { name: "1 finding in this file" })).toBeInTheDocument();
  });

  it("shows the blocker label and the finding card without any click once the group is open", () => {
    setup();
    open("Core logic");
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
  });

  it("Accept calls the finding action with the pr id", () => {
    setup();
    open("Core logic");
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("Original order drops the group headers and keeps pr.files order", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByText("Core logic")).toBeNull();
    const paths = ["README.md", "src/a.ts", "pnpm-lock.yaml", "src/a.test.ts"];
    const pos = paths.map((p) => screen.getByText(p));
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i - 1]!.compareDocumentPosition(pos[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("Hide comments hides the finding card", () => {
    setup();
    open("Core logic");
    fireEvent.click(screen.getByRole("button", { name: /Hide comments/ }));
    expect(screen.queryByText("Hardcoded secret")).toBeNull();
  });

  it("shows 'Review not run yet' on every header when there are no reviews", () => {
    state.reviews = [];
    setup();
    expect(screen.getAllByText("Review not run yet").length).toBe(5);
  });

  it("clicking the card header collapses the rationale", () => {
    setup();
    open("Core logic");
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(screen.queryByText("A secret is committed.")).toBeNull();
  });

  it("falls back to all five groups when the route returns none", () => {
    state.smart = { ...SMART, groups: [] };
    setup();
    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getAllByText(/files$/).length).toBeGreaterThanOrEqual(5);
  });

  it("shows a placeholder, not the flat list, while the grouping loads", () => {
    state.smart = undefined;
    state.loading = true;
    setup();
    expect(screen.queryByText("src/a.ts")).toBeNull();
    expect(screen.queryByText("Core logic")).toBeNull();
  });

  it("on a grouping error shows a notice, the flat list, and the toggle on Original order", () => {
    state.smart = undefined;
    state.error = true;
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't group the files by role");
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "true");
  });

  it("counts only findings on rendered files in the Hide comments button", () => {
    state.reviews = [
      {
        ...REVIEW,
        findings: [FINDING, { ...FINDING, id: "f9", file: "not/in/pr.ts" }],
      } as unknown as ReviewRecord,
    ];
    setup();
    expect(screen.getByRole("button", { name: "Hide comments (1)" })).toBeInTheDocument();
  });
});
