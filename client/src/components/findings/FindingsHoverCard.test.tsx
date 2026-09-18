import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsHoverCard } from "./FindingsHoverCard";

afterEach(cleanup);

let seq = 0;
function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    review_id: "rv1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function renderCard(props: Partial<React.ComponentProps<typeof FindingsHoverCard>> = {}) {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsHoverCard
        findings={props.findings ?? [finding()]}
        repoFullName="acme/payments-api"
        headSha="abc1234"
        loading={props.loading}
        onFindingClick={props.onFindingClick}
      >
        <span>chips</span>
      </FindingsHoverCard>
    </NextIntlClientProvider>,
  );
  const trigger = container.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
  return { container, trigger };
}

describe("FindingsHoverCard", () => {
  it("is closed until hovered, then lists the findings", () => {
    const { trigger } = renderCard({
      findings: [
        finding({ id: "a", title: "Hardcoded Stripe secret key in commit" }),
        finding({ id: "b", title: "N+1 query in user list endpoint", severity: "WARNING", category: "perf" }),
      ],
    });
    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);

    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    // header + aria use the ICU plural
    expect(screen.getByText("2 findings")).toBeInTheDocument();
  });

  it("deep-links each finding's file:line to the GitHub blob", () => {
    const { trigger } = renderCard({ findings: [finding({ file: "src/config.ts", start_line: 12, end_line: 12 })] });
    fireEvent.mouseEnter(trigger);
    const link = screen.getByText("src/config.ts:12").closest("a") as HTMLAnchorElement;
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc1234/src/config.ts#L12",
    );
  });

  it("shows a loading row while fetching (list lazy load)", () => {
    const { trigger } = renderCard({ findings: [], loading: true });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { trigger } = renderCard({ findings: [finding({ title: "Secret key" })] });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("Secret key")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByText("Secret key")).not.toBeInTheDocument();
  });

  it("calls onFindingClick when a finding row is clicked, but not its file link", () => {
    const onFindingClick = vi.fn();
    const { trigger } = renderCard({
      findings: [
        finding({ id: "x1", title: "Clickable finding", file: "src/config.ts", start_line: 12, end_line: 12 }),
      ],
      onFindingClick,
    });
    fireEvent.mouseEnter(trigger);

    // Clicking the file:line GitHub link must NOT jump to the finding.
    fireEvent.click(screen.getByText("src/config.ts:12"));
    expect(onFindingClick).not.toHaveBeenCalled();

    // Clicking the row (title) jumps to the finding.
    fireEvent.click(screen.getByText("Clickable finding"));
    expect(onFindingClick).toHaveBeenCalledWith(expect.objectContaining({ id: "x1" }));
  });

  it("stays open while scrolling INSIDE the card, closes only on page scroll", () => {
    const { trigger } = renderCard({ findings: [finding({ title: "Secret key" })] });
    fireEvent.mouseEnter(trigger);
    const card = screen.getByRole("dialog");

    // Scrolling the card's own overflow must NOT dismiss it.
    fireEvent.scroll(card);
    expect(screen.getByText("Secret key")).toBeInTheDocument();

    // A page scroll (fixed coords go stale) closes it.
    fireEvent.scroll(window);
    expect(screen.queryByText("Secret key")).not.toBeInTheDocument();
  });
});
