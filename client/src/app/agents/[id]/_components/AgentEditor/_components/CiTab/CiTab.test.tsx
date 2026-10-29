import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/ci.json";

type Q = { data?: unknown; isLoading: boolean; isError: boolean };
let installs: Q;
let repos: Q;
vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => installs,
  useExportCi: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
}));
vi.mock("@/lib/hooks/core", () => ({ useRepos: () => repos }));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "m1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  context_docs: [],
  enabled: true,
  version: 1,
};
const REPO = { id: "r1", full_name: "acme/api", default_branch: "main" } as Repo;
const INSTALL: CiInstallation = {
  id: "i1",
  agent_id: "ag1",
  repo: "acme/<b>api</b>",
  target_type: "gha",
  installed_at: "2026-10-01T12:00:00.000Z",
};

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  installs = { data: [], isLoading: false, isError: false };
  repos = { data: [REPO], isLoading: false, isError: false };
});
afterEach(cleanup);

describe("CiTab (V60)", () => {
  it("shows the empty text and an enabled Publish button (AC-B1, AC-B2a)", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Continuous Integration" })).toBeInTheDocument();
    expect(screen.getByText(/Not deployed to CI yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish to CI" })).toBeEnabled();
  });

  it("lists installations as literal text (AC-B2a, AC-64)", () => {
    installs = { data: [INSTALL], isLoading: false, isError: false };
    mount();
    const date = new Date(INSTALL.installed_at).toLocaleDateString();
    expect(screen.getByText(`acme/<b>api</b> · installed ${date}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update CI" })).toBeInTheDocument();
  });

  it("shows a spinner while loading (AC-B2b)", () => {
    installs = { isLoading: true, isError: false };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading installations");
  });

  it("disables Publish with a hint when no repository is connected (AC-B3)", async () => {
    repos = { data: [], isLoading: false, isError: false };
    mount();
    expect(screen.getByRole("button", { name: "Publish to CI" })).toBeDisabled();
    expect(screen.getByText("Connect a repository first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish to CI" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
