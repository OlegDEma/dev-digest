import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const deleteMutate = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillRailCard } from "./SkillRailCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
});

const SKILL: SkillSummary = {
  id: "s1",
  name: "breaking-change-detector",
  description: "Treat every existing route as having callers you cannot see.",
  type: "rubric",
  source: "manual",
  body: "# Breaking-change detector",
  enabled: true,
  version: 4,
  used_by: 2,
  pull_pct: 10,
  accept_pct: null,
};

function renderCard(over: Partial<SkillSummary> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillRailCard skill={{ ...SKILL, ...over }} onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("SkillRailCard", () => {
  it("shows the current version and how many agents bind it", () => {
    renderCard();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("shows name, type and source", () => {
    renderCard();
    expect(screen.getByText("breaking-change-detector")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("marks an imported skill as imported, not manual", () => {
    renderCard({ source: "imported_url" });
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
  });

  it("has a Delete button that opens a confirmation instead of deleting", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Delete "breaking-change-detector"\?/);
    expect(dialog).toHaveTextContent(/bound to 2 agents/);
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("does not swallow keyboard activation of its nested controls", () => {
    // The card root is role="button" with its own Enter/Space handler. If that
    // handler runs for keydowns bubbling from the delete button, preventDefault()
    // cancels the button's activation and the card is merely selected instead —
    // verified in a real browser before the guard was added.
    const onClick = vi.fn();
    renderCard();
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillRailCard skill={SKILL} onClick={onClick} onToggle={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const del = within(container).getByRole("button", { name: "Delete skill" });
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    del.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("still activates the card itself from the keyboard", () => {
    const onClick = vi.fn();
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillRailCard skill={SKILL} onClick={onClick} onToggle={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const card = within(container).getByRole("button", { name: SKILL.name });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });

  it("cancelling the confirmation deletes nothing", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("confirming deletes the skill", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.any(Object));
  });
});
