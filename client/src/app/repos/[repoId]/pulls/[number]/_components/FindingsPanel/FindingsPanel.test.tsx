import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  const TWO: FindingRecord[] = [
    FINDINGS[0]!,
    {
      ...FINDINGS[0]!,
      id: "f2",
      title: "N+1 query",
      rationale: "One query per row.",
      severity: "WARNING",
    },
  ];

  it("expands the FIRST finding by default (rationale visible only when expanded)", () => {
    renderWithIntl(<FindingsPanel findings={TWO} prId="pr1" />);
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument(); // f1 expanded
    expect(screen.queryByText("One query per row.")).not.toBeInTheDocument(); // f2 collapsed
  });

  it("expands the TARGET finding (and collapses the first) when targetFindingId is set", () => {
    renderWithIntl(
      <FindingsPanel findings={TWO} prId="pr1" targetFindingId="f2" targetNonce={1} />,
    );
    expect(screen.getByText("One query per row.")).toBeInTheDocument(); // f2 expanded
    expect(screen.queryByText("A secret is committed.")).not.toBeInTheDocument(); // f1 collapsed
  });
});
