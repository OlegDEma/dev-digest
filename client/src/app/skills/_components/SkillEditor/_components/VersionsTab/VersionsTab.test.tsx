import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const restoreMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({
    data: [
      { skill_id: "s1", version: 3, body: "line1\nline2\nline3", created_at: "2026-09-21T10:00:00Z" },
      { skill_id: "s1", version: 2, body: "line1\nline2", created_at: "2026-09-20T10:00:00Z" },
      { skill_id: "s1", version: 1, body: "line1", created_at: "2026-09-19T10:00:00Z" },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "line1\nline2\nline3",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("lists versions newest-first, marks the current one, and only offers Restore on older ones", () => {
    renderTab();
    expect(screen.getByRole("heading", { level: 2, name: "Version history" })).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    // Exactly one "Current" pill, and one fewer Restore button than versions.
    expect(screen.getAllByText("Current")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("expands an inline diff of a version against the one before it", () => {
    renderTab();
    // The current version (v3) added "line3" over v2.
    const diffButtons = screen.getAllByRole("button", { name: "Diff" });
    fireEvent.click(diffButtons[0]!);
    // The panel expands (button flips to "Hide diff") and shows the added line.
    expect(screen.getByRole("button", { name: "Hide diff" })).toBeInTheDocument();
    expect(screen.getByText("line3")).toBeInTheDocument();
  });

  it("restores an older version by PUTting its body", () => {
    renderTab();
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    // The last Restore belongs to v1 (body "line1").
    fireEvent.click(restoreButtons[restoreButtons.length - 1]!);
    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0]![0]).toEqual({ id: "s1", patch: { body: "line1" } });
  });
});
