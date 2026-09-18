import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounts } from "./SeverityCounts";
import type { SeverityCounts as Counts } from "@/lib/findings";

afterEach(cleanup);

function renderCounts(counts: Counts, blockers?: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounts counts={counts} blockers={blockers} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityCounts", () => {
  it("renders one chip per NON-zero severity (zeros hidden)", () => {
    const { container } = renderCounts({ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 });
    // .tnum is the count span inside each SeverityBadge → one per shown chip.
    expect(container.querySelectorAll(".tnum")).toHaveLength(2);
    expect(screen.getByLabelText("3 findings")).toBeInTheDocument();
  });

  it("appends '· N blockers' only when blockers > 0", () => {
    renderCounts({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }, 2);
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("no blockers text when blockers is 0/undefined", () => {
    renderCounts({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("all-zero counts render no chips, aria says '0 findings'", () => {
    const { container } = renderCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(container.querySelectorAll(".tnum")).toHaveLength(0);
    expect(screen.getByLabelText("0 findings")).toBeInTheDocument();
  });
});
