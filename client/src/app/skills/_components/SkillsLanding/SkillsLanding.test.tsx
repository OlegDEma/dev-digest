import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const replace = vi.fn();
let skillsData: SkillSummary[] = [];
let loading = false;

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: loading ? undefined : skillsData, isLoading: loading, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsLanding } from "./SkillsLanding";

afterEach(() => {
  cleanup();
  replace.mockReset();
});

const SKILL: SkillSummary = {
  id: "s1",
  name: "aaa-first",
  description: "",
  type: "rubric",
  source: "manual",
  body: "#",
  enabled: true,
  version: 1,
  evidence_files: null,
  used_by: 0,
  pull_pct: null,
  accept_pct: null,
};

function renderLanding() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsLanding />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsLanding (/skills)", () => {
  it("opens the first skill in the editor as soon as the list loads", () => {
    skillsData = [SKILL, { ...SKILL, id: "s2", name: "bbb-second" }];
    loading = false;
    renderLanding();
    expect(replace).toHaveBeenCalledWith("/skills/s1?tab=config");
  });

  it("shows the empty state with create / import CTAs when there are no skills", () => {
    skillsData = [];
    loading = false;
    renderLanding();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create your first skill"));
    // The create modal opened (its title + its submit button both say "Create skill").
    expect(screen.getByRole("dialog")).toHaveTextContent("Create skill");
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeInTheDocument();
  });
});
