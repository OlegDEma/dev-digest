import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink, SkillSummary } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import dashMessages from "../../../../../../../../messages/en/evalDashboard.json";
import { makeDetail } from "@/lib/test-support/eval-fixtures";

const mutate = vi.fn();
const success = vi.fn();
let promote: { isPending: boolean; error: Error | null; mutate: typeof mutate };
let links: AgentSkillLink[];
let linksState: { isLoading?: boolean; isError?: boolean } = {};
let skillsState: { isLoading?: boolean; isError?: boolean } = {};
let skills: Partial<SkillSummary>[];
vi.mock("@/lib/hooks/eval-dashboards", () => ({ usePromoteEvalRun: () => promote }));
vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: links, ...linksState }),
  useSkills: () => ({ data: skills, ...skillsState }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success, error: vi.fn() }) }));

import { PromoteConfirm } from "./PromoteConfirm";
import { planPromotion } from "./helpers";

const live = { ...makeDetail().config, agent_version: 3, config_id: "live-cfg", system_prompt: "old prompt" };
const target = () => {
  const run = makeDetail({ id: "run-b" });
  run.config = {
    ...run.config,
    agent_version: 7,
    system_prompt: "new prompt",
    model: "m2",
    strategy: "map-reduce",
    skills: [
      { skill_id: "s1", name: "Sec", version: 1 },
      { skill_id: "s2", name: "Perf", version: 2 },
    ],
  };
  return run;
};

const handlers = { onReload: vi.fn(), onCancel: vi.fn(), onDone: vi.fn() };
const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, evalDashboard: dashMessages }}>
      <PromoteConfirm agentId="ag1" run={target()} live={live} {...handlers} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  linksState = {};
  skillsState = {};
  promote = { isPending: false, error: null, mutate };
  links = [
    { agent_id: "ag1", skill_id: "s1", order: 0 },
    { agent_id: "ag1", skill_id: "s9", order: 1 },
  ];
  skills = [
    { id: "s1", name: "Sec", version: 1 },
    { id: "s2", name: "Perf", version: 5 },
    { id: "s9", name: "Style", version: 1 },
  ];
});
afterEach(() => {
  cleanup();
  mutate.mockReset();
  success.mockReset();
  Object.values(handlers).forEach((h) => h.mockReset());
});

describe("planPromotion", () => {
  it("separates link / unlink / version drift (AC-D55, AC-D56)", () => {
    const plan = planPromotion(live, target().config, links, skills as SkillSummary[]);
    expect(plan.link).toEqual(["Perf"]);
    expect(plan.unlink).toEqual(["Style"]);
    expect(plan.versionWarnings).toEqual([{ name: "Perf", current: 5, old: 2 }]);
    expect(plan.hasChanges).toBe(true);
  });
});

describe("PromoteConfirm", () => {
  it("disables Promote with a loading row while the agent's skills load (AC-D55)", () => {
    skillsState = { isLoading: true };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the agent's skills…");
    expect(screen.getByRole("button", { name: "Promote" })).toBeDisabled();
    expect(screen.queryByTestId("promote-changes")).toBeNull();
  });

  it("shows an error and keeps Promote disabled when the skills fail to load (AC-D55)", () => {
    linksState = { isError: true };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the agent's skills");
    expect(screen.getByRole("button", { name: "Promote" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("lists the changed fields, skills to link and unlink, and the skill-version warning (AC-D55, AC-D56)", () => {
    mount();
    const list = screen.getByTestId("promote-changes");
    expect(list).toHaveTextContent("System prompt will be replaced");
    expect(list).toHaveTextContent("Model: openrouter/m1 → openrouter/m2");
    expect(list).toHaveTextContent("Strategy: single-pass → map-reduce");
    expect(list).toHaveTextContent("Skills to link: Perf");
    expect(list).toHaveTextContent("Skills to unlink: Style");
    expect(screen.getByRole("note")).toHaveTextContent("Perf is now v5 (run used v2) — current body will be used");
  });

  it("promotes against the live config id, then toasts 'Promoted v<B> config as v<new>' and closes (AC-D60a)", () => {
    mutate.mockImplementation((_b, o) => o.onSuccess({ agent: {}, version: 9 }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(mutate.mock.calls[0]![0]).toEqual({ run_id: "run-b", expected_config_id: "live-cfg" });
    expect(success).toHaveBeenCalledWith("Promoted v7 config as v9");
    expect(handlers.onDone).toHaveBeenCalled();
  });

  it("explains a stale agent and offers Reload (AC-D59a, AC-D59b)", () => {
    promote.error = new ApiError("changed", 409, "agent_changed");
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("The agent changed since you opened this comparison — reload and review again");
    expect(screen.getByRole("button", { name: "Promote" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(handlers.onReload).toHaveBeenCalled();
    expect(handlers.onCancel).toHaveBeenCalled();
  });

  it("names the skills that are no longer available (AC-D59c)", () => {
    promote.error = new ApiError("gone", 422, "skill_unavailable", { skills: ["Perf", "Sec"] });
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available: Perf, Sec");
  });

  it("renders skill names as literal text (AC-D95)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    skills = [{ id: "s9", name: evil, version: 1 }];
    const { container } = mount();
    expect(container.ownerDocument.querySelector("img")).toBeNull();
    expect(screen.getByTestId("promote-changes")).toHaveTextContent(evil);
  });
});
