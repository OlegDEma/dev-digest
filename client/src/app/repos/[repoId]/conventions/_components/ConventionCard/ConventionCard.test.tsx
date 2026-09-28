import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const onStatus = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();

afterEach(() => {
  cleanup();
  onStatus.mockReset();
  onEdit.mockReset();
  onDelete.mockReset();
});

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  category: "styling",
  rule: "Co-located styles live in a styles.ts exporting a single object named s",
  rationale: "Flag inline style objects declared in the component file.",
  evidence_path: "src/widget/styles.ts",
  evidence_line: 3,
  evidence_snippet: "export const s = {",
  occurrences: 42,
  confidence: 0.92,
  status: "pending",
  created_at: "2026-09-23T00:00:00.000Z",
};

function renderCard(over: Partial<ConventionCandidate> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={{ ...CANDIDATE, ...over }}
        repoFullName="acme/app"
        branch="main"
        onStatus={onStatus}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("shows the rule, its category, the evidence and the confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("styling")).toBeInTheDocument();
    expect(screen.getByText("src/widget/styles.ts:3")).toBeInTheDocument();
    expect(screen.getByText("export const s = {")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("shows the measured occurrence count", () => {
    renderCard();
    expect(screen.getByText("42 occurrences")).toBeInTheDocument();
  });

  it("omits the occurrence badge when the probe was never measured", () => {
    renderCard({ occurrences: null });
    expect(screen.queryByText(/occurrence/)).not.toBeInTheDocument();
  });

  it("deep-links the evidence to the exact line on GitHub", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "src/widget/styles.ts:3" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/main/src/widget/styles.ts#L3");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("accepts and rejects", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onStatus).toHaveBeenCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onStatus).toHaveBeenCalledWith("rejected");
  });

  it("toggles an already-accepted candidate back to pending", () => {
    renderCard({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: /Accepted/ }));
    expect(onStatus).toHaveBeenCalledWith("pending");
  });

  it("edits INLINE — the rule becomes a field in place, with no navigation", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const ruleField = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(ruleField, { target: { value: "  Styles live in styles.ts  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    // Trimmed on the way out.
    expect(onEdit).toHaveBeenCalledWith({
      rule: "Styles live in styles.ts",
      rationale: CANDIDATE.rationale,
    });
  });

  it("treats an emptied rationale as a deliberate clear, not an empty string", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rationale!), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onEdit).toHaveBeenCalledWith({ rule: CANDIDATE.rule, rationale: null });
  });

  it("refuses to save an empty rule", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("abandons an edit on cancel", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("deletes", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("renders plain text when the repo is unknown, not a broken link", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionCard
          candidate={CANDIDATE}
          onStatus={onStatus}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/widget/styles.ts:3")).toBeInTheDocument();
  });
});
