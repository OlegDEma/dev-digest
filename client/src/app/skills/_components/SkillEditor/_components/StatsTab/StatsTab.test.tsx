import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

let statsData: SkillStats | undefined;

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: statsData, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "#",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders the four tiles and the agents list with Open links", () => {
    statsData = {
      used_by: 3,
      runs_30d: 100,
      runs_with_skill_30d: 71,
      pull_pct: 71,
      findings_30d: 96,
      accepted_30d: 74,
      dismissed_30d: 26,
      accept_pct: 74,
      agents: [
        { id: "ag1", name: "Security Reviewer" },
        { id: "ag2", name: "Performance Reviewer" },
      ],
    };
    renderTab();
    expect(screen.getByTestId("stat-Used by")).toHaveTextContent("3");
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Pull frequency")).toHaveTextContent("71");
    expect(screen.getByTestId("stat-Accept rate")).toHaveTextContent("74");
    expect(screen.getByTestId("stat-Findings (30d)")).toHaveTextContent("96");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/agents/ag1?tab=skills", "/agents/ag2?tab=skills"]);
    expect(screen.getAllByText("Open")).toHaveLength(2);
  });

  it("renders — (with a reason) when a rate has no denominator, and the no-agents hint", () => {
    statsData = {
      used_by: 0,
      runs_30d: 0,
      runs_with_skill_30d: 0,
      pull_pct: null,
      findings_30d: 0,
      accepted_30d: 0,
      dismissed_30d: 0,
      accept_pct: null,
      agents: [],
    };
    renderTab();
    expect(screen.getByTestId("stat-Pull frequency")).toHaveTextContent("—");
    expect(screen.getByTestId("stat-Accept rate")).toHaveTextContent("—");
    expect(screen.getByText("No finished runs in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByText(/has been accepted or dismissed yet/)).toBeInTheDocument();
    expect(screen.getByText(/No agents bind this skill yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
