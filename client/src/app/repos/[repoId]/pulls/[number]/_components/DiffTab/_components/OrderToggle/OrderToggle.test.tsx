import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { OrderToggle } from "./OrderToggle";

afterEach(cleanup);

function setup(value: "smart" | "original", onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <OrderToggle value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("OrderToggle", () => {
  it("marks the active option with aria-pressed and names the group", () => {
    setup("smart");
    expect(screen.getByRole("group", { name: "Diff order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange('original') on click", () => {
    const onChange = setup("smart");
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(onChange).toHaveBeenCalledWith("original");
  });
});
