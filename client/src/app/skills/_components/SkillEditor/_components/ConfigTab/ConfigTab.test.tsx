import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const replace = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useSkillAgents: () => ({ data: [{ id: "ag1", name: "Test Quality Reviewer" }] }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  replace.mockReset();
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\nEvaluate the PR.",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderTab(skill: Skill = SKILL) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("renders the form from the skill with the version badge and a clean (disabled) Save", () => {
    renderTab();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    expect(screen.getByText(/This line is the skill's interface/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save skill/ })).toBeDisabled();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("editing the body shows unsaved, enables Save, and Save PUTs the whole form", () => {
    renderTab();
    fireEvent.change(screen.getByRole("textbox", { name: "pr-quality-rubric.md" }), {
      target: { value: "# PR Quality Rubric\n\nEvaluate the PR.\n\n## Scope" },
    });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /Save skill/ });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]![0]).toEqual({
      id: "s1",
      patch: {
        name: "pr-quality-rubric",
        description: "Rubric for evaluating overall PR quality.",
        type: "rubric",
        body: "# PR Quality Rubric\n\nEvaluate the PR.\n\n## Scope",
        enabled: true,
      },
    });
  });

  it("Cancel resets the form; an empty name or body blocks Save with a message", () => {
    renderTab();
    const name = screen.getByDisplayValue("pr-quality-rubric");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save skill/ })).toBeDisabled();
  });

  it("Delete opens a confirmation dialog naming the binding agents", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Delete skill/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Delete "pr-quality-rubric"\?/);
    expect(dialog).toHaveTextContent(/bound to 1 agent/);
    // Nothing is deleted until the user confirms.
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("cancelling the dialog deletes nothing", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Delete skill/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("confirming deletes and returns to /skills", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Delete skill/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete skill/ }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.any(Object));
    const opts = deleteMutate.mock.calls[0]![1] as { onSuccess: () => void };
    act(() => opts.onSuccess());
    expect(replace).toHaveBeenCalledWith("/skills");
  });

  it("shows the trust notice for an imported skill", () => {
    renderTab({ ...SKILL, source: "imported_url" });
    expect(screen.getByRole("note")).toHaveTextContent(/Imported skill/);
  });
});
