import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const items: ReviewFocusItem[] = [
  { file: "src/a.ts", line: 12, reason: "Auth check moved", source: "pr_diff", line_corrected: false },
  { file: "src/b.ts", line: 3, reason: "Caller of changed fn", source: "blast_map", line_corrected: true },
];

function renderIt(props: { items: ReviewFocusItem[]; loading?: boolean }, onOpenRef = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus {...props} onOpenRef={onOpenRef} />
    </NextIntlClientProvider>,
  );
  return onOpenRef;
}

describe("ReviewFocus", () => {
  it("AC-45: heading with count, file:line — reason in model order, with markers", () => {
    renderIt({ items });
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("src/a.ts:12— Auth check moved");
    expect(rows[1]).toHaveTextContent("src/b.ts:3— Caller of changed fn");
    expect(rows[0]).not.toHaveTextContent("line adjusted");
    expect(rows[1]).toHaveTextContent("line adjusted");
    expect(rows[1]).toHaveTextContent("outside diff");
  });

  it("singular count", () => {
    renderIt({ items: [items[0]!] });
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("AC-51/NFR-5: click opens file and line; button has file+line accessible name", () => {
    const open = renderIt({ items });
    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts line 12 in Files changed" }));
    expect(open).toHaveBeenCalledWith("src/a.ts", 12);
  });

  it("AC-46: empty copy", () => {
    renderIt({ items: [] });
    expect(screen.getByText("No review focus items.")).toBeInTheDocument();
  });

  it("AC-4: skeleton while the first generation is pending", () => {
    renderIt({ items: [], loading: true });
    expect(screen.getByTestId("focus-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No review focus items.")).not.toBeInTheDocument();
  });

  it("AC-61: reason is rendered as text", () => {
    renderIt({ items: [{ ...items[0]!, reason: "<b>bold</b>" }] });
    expect(screen.getByText(/<b>bold<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });
});
