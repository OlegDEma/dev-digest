import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiExport, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";

const previewMutate = vi.fn();
const publishMutate = vi.fn();
let previewState: Record<string, unknown>;
let publishState: Record<string, unknown>;
vi.mock("@/lib/hooks/ci", () => ({
  // First call per render = preview, second = publish (PublishDialog order).
  useExportCi: (() => {
    let n = 0;
    return () => (n++ % 2 === 0 ? { ...previewState, mutate: previewMutate } : { ...publishState, mutate: publishMutate });
  })(),
}));

import { PublishDialog } from "./PublishDialog";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
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
const REPOS = [{ id: "r1", full_name: "acme/api", default_branch: "trunk" }] as Repo[];
const FILES: CiExport = {
  installation: { id: "", agent_id: "ag1", repo: "acme/api", target_type: "gha", installed_at: "2026-10-01T00:00:00Z" },
  files: [
    { path: ".github/workflows/devdigest-review.yml", contents: "name: <script>alert(1)</script>", editable: true },
    { path: ".devdigest/agents/security-reviewer.yaml", contents: "{}", editable: true },
  ],
  pr_url: null,
};

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <PublishDialog agent={AGENT} repos={REPOS} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  previewState = { data: FILES, isPending: false, isError: false };
  publishState = { data: undefined, isPending: false, isError: false };
});
afterEach(() => {
  cleanup();
  previewMutate.mockReset();
  publishMutate.mockReset();
});

describe("PublishDialog (V61)", () => {
  it("requests a files preview on open and lists every path and its contents as text (AC-B4a, AC-B4b, AC-64)", async () => {
    mount();
    await waitFor(() =>
      expect(previewMutate).toHaveBeenCalledWith({
        repo: "acme/api",
        base: "trunk",
        post_as: "github_review",
        triggers: ["opened", "synchronize", "reopened"],
        action: "files",
      }),
    );
    expect(screen.getByText(".github/workflows/devdigest-review.yml")).toBeInTheDocument();
    expect(screen.getByText(".devdigest/agents/security-reviewer.yaml")).toBeInTheDocument();
    expect(screen.getByText("name: <script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("names the secret variable and shows the readability notice above Publish (AC-B6b, AC-B6c)", () => {
    mount();
    expect(screen.getByText(/Add OPENAI_API_KEY to the repo's Actions secrets/)).toBeInTheDocument();
    const notice = screen.getByText(
      "The system prompt and linked skills will be readable by anyone with read access to acme/api.",
    );
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(notice.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("publishes with open_pr", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(publishMutate).toHaveBeenCalledWith(expect.objectContaining({ repo: "acme/api", action: "open_pr" }));
  });

  it("shows Published and a View pull request link on success (AC-B8b)", () => {
    publishState = { data: { ...FILES, pr_url: "https://github.com/acme/api/pull/7" }, isPending: false, isError: false };
    mount();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View pull request" })).toHaveAttribute("href", "https://github.com/acme/api/pull/7");
  });

  it("does not link a non-http pr_url (AC-64)", () => {
    publishState = { data: { ...FILES, pr_url: "javascript:alert(1)" }, isPending: false, isError: false };
    mount();
    expect(screen.queryByRole("link", { name: "View pull request" })).not.toBeInTheDocument();
  });

  it("shows the github_write_failed message as text (AC-B9b)", () => {
    publishState = { data: undefined, isPending: false, isError: true, error: new Error("Resource not accessible <b>x</b>") };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Resource not accessible <b>x</b>");
  });

  it("disables Publish with a hint when no trigger is selected", () => {
    mount();
    for (const name of ["opened", "synchronize", "reopened"]) fireEvent.click(screen.getByRole("checkbox", { name }));
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Select at least one trigger to publish.")).toBeInTheDocument();
  });

  it("explains the expected failing check before Publish and after success", () => {
    const note = "The check on this first pull request is expected to fail until it is merged — the CI policy is read from the base branch.";
    mount();
    const before = screen.getByText(note);
    expect(before.compareDocumentPosition(screen.getByRole("button", { name: "Publish" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    publishState = { data: { ...FILES, pr_url: "https://github.com/acme/api/pull/7" }, isPending: false, isError: false };
    mount();
    expect(screen.getByText(note)).toBeInTheDocument();
  });
});
