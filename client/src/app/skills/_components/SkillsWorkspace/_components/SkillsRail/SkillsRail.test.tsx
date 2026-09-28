import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const updateMutate = vi.fn();
let skillsData: SkillSummary[] = [];

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: skillsData, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsRail } from "./SkillsRail";

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
});

const skill = (id: string, name: string, extra: Partial<SkillSummary> = {}): SkillSummary => ({
  id,
  name,
  description: `${name} — what it checks`,
  type: "rubric",
  source: "manual",
  body: "# body",
  enabled: true,
  version: 1,
  evidence_files: null,
  used_by: 3,
  pull_pct: 71,
  accept_pct: 74,
  ...extra,
});

const SKILLS = [
  skill("s1", "pr-quality-rubric"),
  skill("s2", "phantom-api-gate", { type: "security", source: "imported_url", enabled: false, used_by: 0, pull_pct: null, accept_pct: null }),
];

function renderRail(props: Partial<React.ComponentProps<typeof SkillsRail>> = {}) {
  const onSelect = vi.fn();
  const onCreate = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsRail activeId="s1" onSelect={onSelect} onCreate={onCreate} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSelect, onCreate };
}

describe("SkillsRail", () => {
  it("renders a card per skill with type, source and the agents · pull · accept line", () => {
    skillsData = SKILLS;
    renderRail();
    const first = screen.getByRole("button", { name: "pr-quality-rubric" });
    expect(first).toHaveAttribute("aria-current", "true");
    expect(within(first).getByText("rubric")).toBeInTheDocument();
    expect(within(first).getByText("Manual")).toBeInTheDocument();
    expect(within(first).getByText("3 agents")).toBeInTheDocument();
    expect(within(first).getByText("71% pull")).toBeInTheDocument();
    expect(within(first).getByText("74% accept")).toBeInTheDocument();

    // Rates without a denominator render as "—", never 0.
    const second = screen.getByRole("button", { name: "phantom-api-gate" });
    expect(second).not.toHaveAttribute("aria-current");
    expect(within(second).getByText("Imported")).toBeInTheDocument();
    expect(within(second).getByText("0 agents")).toBeInTheDocument();
    expect(within(second).getByText("— pull")).toBeInTheDocument();
    expect(within(second).getByText("— accept")).toBeInTheDocument();
  });

  it("selecting a card hands the skill to the parent; the toggle PUTs only `enabled`", () => {
    skillsData = SKILLS;
    const { onSelect } = renderRail();
    const second = screen.getByRole("button", { name: "phantom-api-gate" });
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }));
    fireEvent.click(within(second).getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s2", patch: { enabled: true } });
    // The toggle click did not also select the card.
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("filters by search and shows the no-match hint", () => {
    skillsData = SKILLS;
    renderRail();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "phantom" } });
    expect(screen.queryByRole("button", { name: "pr-quality-rubric" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "phantom-api-gate" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "zzz" } });
    expect(screen.getByText("No skills match this search.")).toBeInTheDocument();
  });

  it("Add Skill opens the create modal directly (no dropdown)", () => {
    skillsData = SKILLS;
    const { onCreate } = renderRail();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    // It is a plain button — no menu items appear.
    expect(screen.queryByText("Create from scratch")).not.toBeInTheDocument();
    expect(screen.queryByText("Import from file (.md / .zip)")).not.toBeInTheDocument();
  });
});
