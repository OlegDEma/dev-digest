import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

vi.mock("../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillAgents: () => ({ data: [] }),
  useSkillStats: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({
    data: [{ skill_id: "s1", version: 5, body: "# PR Quality Rubric", created_at: "2026-09-21T10:00:00Z" }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderEditor(tab: React.ComponentProps<typeof SkillEditor>["tab"]) {
  const onTab = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillEditor skill={SKILL} tab={tab} onTab={onTab} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onTab };
}

describe("SkillEditor", () => {
  it("shows the header (name · type · vN · Run on evals) and the five tabs in the design's order", () => {
    renderEditor("config");
    expect(screen.getByRole("heading", { level: 1, name: "pr-quality-rubric" })).toBeInTheDocument();
    expect(screen.getAllByText("v5").length).toBeGreaterThan(0);
    const tabs = ["Config", "Preview", "Evals", "Stats", "Versions"].map((n) => screen.getByRole("button", { name: n }));
    expect(tabs).toHaveLength(5);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("tab clicks and Run on evals go through onTab; Evals is a placeholder, Versions lists history", () => {
    const { onTab } = renderEditor("evals");
    expect(screen.getByText(/arrive with the Eval lesson/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(onTab).toHaveBeenCalledWith("stats");
    fireEvent.click(screen.getByRole("button", { name: /Run on evals/ }));
    expect(onTab).toHaveBeenCalledWith("evals");
    cleanup();
    renderEditor("versions");
    expect(screen.getByRole("heading", { level: 2, name: "Version history" })).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });
});
