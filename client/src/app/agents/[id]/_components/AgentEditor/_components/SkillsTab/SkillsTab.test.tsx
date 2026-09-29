import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { buildRows, moveBound, toggleBound } from "./helpers";

const setMutate = vi.fn();
let skillsData: SkillSummary[] = [];
let linksData: AgentSkillLink[] = [];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: skillsData, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: linksData, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setMutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setMutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  system_prompt: "Review tests.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const skill = (id: string, name: string, extra: Partial<SkillSummary> = {}): SkillSummary => ({
  id,
  name,
  description: `${name} description`,
  type: "rubric",
  source: "manual",
  body: "# body",
  enabled: true,
  version: 1,
  evidence_files: null,
  used_by: 0,
  pull_pct: null,
  accept_pct: null,
  ...extra,
});

const SKILLS = [
  skill("s1", "uncovered-branches"),
  skill("s2", "boundary-and-corner-cases"),
  skill("s3", "mocking-discipline", { type: "convention", enabled: false }),
  skill("s4", "zzz-unbound"),
];
// Bound in a non-alphabetical order on purpose: s2 first, then s1.
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s1", order: 1 },
  { agent_id: "ag1", skill_id: "s2", order: 0 },
  { agent_id: "ag1", skill_id: "s3", order: 2 },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab helpers", () => {
  it("buildRows puts bound skills first in link order, then unbound by name", () => {
    const rows = buildRows(SKILLS, LINKS);
    expect(rows.map((r) => [r.skill.id, r.bound])).toEqual([
      ["s2", true],
      ["s1", true],
      ["s3", true],
      ["s4", false],
    ]);
  });

  it("drops a link whose skill no longer exists", () => {
    const rows = buildRows(SKILLS, [...LINKS, { agent_id: "ag1", skill_id: "gone", order: 9 }]);
    expect(rows.some((r) => r.skill.id === "gone")).toBe(false);
  });

  it("toggleBound appends / removes without reordering the rest", () => {
    expect(toggleBound(["s2", "s1"], "s4", true)).toEqual(["s2", "s1", "s4"]);
    expect(toggleBound(["s2", "s1"], "s2", false)).toEqual(["s1"]);
    expect(toggleBound(["s2", "s1"], "s1", true)).toEqual(["s2", "s1"]);
  });

  it("moveBound moves within bounds and is a no-op otherwise", () => {
    expect(moveBound(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveBound(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    const same = ["a", "b"];
    expect(moveBound(same, 0, 5)).toBe(same);
  });
});

describe("SkillsTab", () => {
  it("lists every workspace skill, bound ones first, with the count badge and a disabled marker", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    expect(screen.getByText("3 of 4 enabled")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((el) => el.getAttribute("data-skill-id"))).toEqual(["s2", "s1", "s3", "s4"]);
    expect(within(items[2]!).getByText("disabled")).toBeInTheDocument();
    const checks = screen.getAllByRole("checkbox");
    expect(checks.map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "true", "true", "false"]);
  });

  it("ticking an unbound skill persists the whole ordered set with it appended", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bind zzz-unbound" }));
    expect(setMutate).toHaveBeenCalledTimes(1);
    expect(setMutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillIds: ["s2", "s1", "s3", "s4"] });
  });

  it("unticking a bound skill persists the set without it", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bind uncovered-branches" }));
    expect(setMutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillIds: ["s2", "s3"] });
  });

  it("the arrows reorder bound skills (and the first/last ones are capped)", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    const items = screen.getAllByRole("listitem");
    // s1 is second → move up → [s1, s2, s3]
    fireEvent.click(within(items[1]!).getByRole("button", { name: "Move up" }));
    expect(setMutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillIds: ["s1", "s2", "s3"] });
    // The first row's "Move up" is disabled; the last bound row's "Move down" too.
    expect(within(items[0]!).getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(within(items[2]!).getByRole("button", { name: "Move down" })).toBeDisabled();
    // Unbound rows have no arrows at all.
    expect(within(items[3]!).queryByRole("button", { name: "Move up" })).not.toBeInTheDocument();
  });

  it("filters rows without changing the persisted order", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "mocking" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("3 of 4 enabled")).toBeInTheDocument();
  });

  it("allows drag-reorder only for rows that reach the prompt", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    const items = screen.getAllByRole("listitem");
    // s2, s1 — bound and enabled → draggable.
    expect(items[0]).toHaveAttribute("draggable", "true");
    expect(items[1]).toHaveAttribute("draggable", "true");
    // s3 is bound but globally DISABLED: it is skipped when the prompt is
    // assembled, so its position in the order means nothing.
    expect(items[2]).toHaveAttribute("draggable", "false");
    // s4 is not bound at all.
    expect(items[3]).toHaveAttribute("draggable", "false");
  });

  it("suspends drag while a filter is applied", () => {
    skillsData = SKILLS;
    linksData = LINKS;
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "boundary" } });
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("draggable", "false");
  });

  it("shows the empty state with a link to /skills when the workspace has none", () => {
    skillsData = [];
    linksData = [];
    renderTab();
    expect(screen.getByText("No skills in this workspace")).toBeInTheDocument();
    expect(screen.getByText("Go to Skills")).toBeInTheDocument();
  });
});
