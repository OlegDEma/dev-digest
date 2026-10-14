import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClientProvider, focusManager, useQuery } from "@tanstack/react-query";
import type { Agent, DiscoveredDocument, ProjectContextListing, Skill } from "@devdigest/shared";
import messages from "../../../../messages/en/context.json";
import { ToastProvider } from "../../../lib/toast";
import { createQueryClient } from "../../../lib/query-client";

const apiGet = vi.fn();
const apiPut = vi.fn();
let activeRepoId: string | null = "r1";

vi.mock("../../../lib/api", () => ({
  api: { get: (...a: unknown[]) => apiGet(...a), put: (...a: unknown[]) => apiPut(...a) },
}));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: activeRepoId }),
}));

import { ContextDocsTab } from "./ContextDocsTab";

const doc = (path: string): DiscoveredDocument => ({
  path,
  folder: path.split("/").slice(0, -1).join("/"),
  name: path.split("/").pop()!,
  bucket: path.split("/")[0]!,
  size_bytes: 10,
  status: "ok",
  estimated_tokens: 100,
  used_by_agents: 0,
});

const listing = (over: Partial<ProjectContextListing> = {}): ProjectContextListing => ({
  repo_id: "r1",
  clone_available: true,
  total_found: 3,
  truncated: false,
  documents: [doc("docs/a.md"), doc("specs/b.md"), doc("specs/c.md")],
  ...over,
});

const agent = (docs: string[]) => ({ id: "a1", name: "Sec", context_docs: docs }) as unknown as Agent;
const skill = (docs: string[]) => ({ id: "s1", name: "Sk", context_docs: docs }) as unknown as Skill;

let listingData: ProjectContextListing;
let ownerData: Agent | Skill;

beforeEach(() => {
  activeRepoId = "r1";
  listingData = listing();
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith("/repos/")) return Promise.resolve(listingData);
    return Promise.resolve(ownerData);
  });
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  apiGet.mockReset();
  apiPut.mockReset();
});

function Harness({ variant }: { variant: "agent" | "skill" }) {
  const id = variant === "agent" ? "a1" : "s1";
  const { data } = useQuery({ queryKey: [variant, id], queryFn: () => apiGet(`/${variant}/${id}`) as Promise<Agent | Skill> });
  return data ? <ContextDocsTab variant={variant} owner={data} /> : null;
}

function renderTab(variant: "agent" | "skill" = "agent") {
  // The app's real client, so the global mutation-error toast is in play.
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ToastProvider>
          <Harness variant={variant} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextDocsTab (agent)", () => {
  it("shows rows, count, token sum and the absent row; attach appends, reorder and remove persist the whole list", async () => {
    ownerData = agent(["specs/b.md", "docs/gone.md"]);
    apiPut.mockImplementation((_url: string, body: { context_docs: string[] }) =>
      Promise.resolve({ ...ownerData, context_docs: body.context_docs }),
    );
    renderTab();

    expect(await screen.findByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
    expect(screen.getByText("Injected as an untrusted block (## Project context) into every run.")).toBeInTheDocument();
    // The absent path counts as attached but is left out of the estimate.
    expect(screen.getByText("not in this repository")).toBeInTheDocument();
    expect(screen.getByTestId("attached-tokens")).toHaveTextContent("≈ 100 tokens");
    expect(screen.getByRole("switch", { name: "Attach specs/b.md" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).not.toBeChecked();

    // Attach appends at the end; the estimate follows.
    fireEvent.click(screen.getByRole("switch", { name: "Attach specs/c.md" }));
    await waitFor(() => expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", {
      context_docs: ["specs/b.md", "docs/gone.md", "specs/c.md"],
    }));
    expect(await screen.findByText("3 of 3 attached")).toBeInTheDocument();
    expect(screen.getByTestId("attached-tokens")).toHaveTextContent("≈ 200 tokens");

    // Keyboard reorder.
    fireEvent.click(screen.getByRole("button", { name: "Move specs/b.md down" }));
    await waitFor(() => expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", {
      context_docs: ["docs/gone.md", "specs/b.md", "specs/c.md"],
    }));

    // Remove the absent path.
    fireEvent.click(screen.getByRole("button", { name: "Remove docs/gone.md from the attached list" }));
    await waitFor(() => expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", { context_docs: ["specs/b.md", "specs/c.md"] }));
  });

  it("filters by name or path without changing the attach state", async () => {
    ownerData = agent(["specs/b.md"]);
    renderTab();
    await screen.findByRole("textbox", { name: "Filter documents…" });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "C.MD" } });
    expect(screen.queryByRole("switch", { name: "Attach docs/a.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "" } });
    expect(screen.getByRole("switch", { name: "Attach specs/b.md" })).toBeChecked();
    expect(screen.getByText("1 of 3 attached")).toBeInTheDocument();
  });

  it("restores the rows and shows the not-saved message when the save fails", async () => {
    ownerData = agent([]);
    apiPut.mockRejectedValue(new Error("500 Internal Server Error"));
    renderTab();
    const toggle = await screen.findByRole("switch", { name: "Attach docs/a.md" });
    fireEvent.click(toggle);
    expect(await screen.findByText(/The change was not saved/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Attach docs/a.md" })).not.toBeChecked());
    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();
  });

  it("serialises rapid saves so a slow earlier response cannot overwrite the later list", async () => {
    ownerData = agent([]);
    const resolvers: Array<(v: unknown) => void> = [];
    apiPut.mockImplementation(
      (_u: string, body: { context_docs: string[] }) =>
        new Promise((res) => resolvers.push(() => res({ ...ownerData, context_docs: body.context_docs }))),
    );
    renderTab();
    fireEvent.click(await screen.findByRole("switch", { name: "Attach docs/a.md" }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Attach specs/c.md" }));
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();

    // Only the first PUT is on the wire; the second waits its turn.
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", { context_docs: ["docs/a.md"] });
    resolvers[0]!(null);
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(2));
    expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", { context_docs: ["docs/a.md", "specs/c.md"] });
    // The first result did not clobber the optimistic second list.
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).toBeChecked();
    resolvers[1]!(null);
    await waitFor(() => expect(screen.getByText("2 of 3 attached")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Attach docs/a.md" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).toBeChecked();
  });

  type Call = { res: (v: unknown) => void; rej: (e: Error) => void; docs: string[] };
  function deferPuts(): Call[] {
    const calls: Call[] = [];
    apiPut.mockImplementation(
      (_u: string, body: { context_docs: string[] }) =>
        new Promise((res, rej) => calls.push({ res, rej, docs: body.context_docs })),
    );
    return calls;
  }
  const ownerGets = () => apiGet.mock.calls.filter((c) => !String(c[0]).startsWith("/repos/")).length;

  async function toggleTwo() {
    fireEvent.click(await screen.findByRole("switch", { name: "Attach docs/a.md" }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Attach specs/c.md" }));
    expect(await screen.findByText("2 of 3 attached")).toBeInTheDocument();
  }

  it("when the first save fails while the second is queued: one toast, no rollback, server state at the end", async () => {
    ownerData = agent([]);
    const calls = deferPuts();
    renderTab();
    await toggleTwo();
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.rej(new Error("500 Internal Server Error"));

    // Exactly one toast: the tab's catalog message, not the global handler's raw one.
    await waitFor(() => expect(screen.getAllByText(/500 Internal Server Error/)).toHaveLength(1));
    expect(screen.getByText(/The change was not saved/)).toBeInTheDocument();
    // B's optimistic state is still on screen: no stale-snapshot rollback.
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).toBeChecked();

    await waitFor(() => expect(calls).toHaveLength(2));
    ownerData = agent(calls[1]!.docs);
    const before = ownerGets();
    calls[1]!.res({ ...ownerData });
    await waitFor(() => expect(ownerGets()).toBeGreaterThan(before));
    expect(screen.getByRole("switch", { name: "Attach docs/a.md" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).toBeChecked();
  });

  it("when both saves fail the rows end on the server's (empty) list after a refetch", async () => {
    ownerData = agent([]);
    const calls = deferPuts();
    renderTab();
    await toggleTwo();
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.rej(new Error("500 Internal Server Error"));
    await waitFor(() => expect(calls).toHaveLength(2));
    const before = ownerGets();
    calls[1]!.rej(new Error("500 Internal Server Error"));

    await waitFor(() => expect(ownerGets()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByText("0 of 3 attached")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Attach docs/a.md" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Attach specs/c.md" })).not.toBeChecked();
    expect(screen.getAllByText(/The change was not saved/)).toHaveLength(2);
  });

  it("still sends a queued save while the document is hidden", async () => {
    ownerData = agent([]);
    const calls = deferPuts();
    renderTab();
    fireEvent.click(await screen.findByRole("switch", { name: "Attach docs/a.md" }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
    focusManager.setFocused(false);
    fireEvent.click(screen.getByRole("switch", { name: "Attach specs/c.md" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.res({ ...ownerData, context_docs: calls[0]!.docs });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.docs).toEqual(["docs/a.md", "specs/c.md"]);
    // Settle it: the per-owner chain is module state and must not leak into other tests.
    calls[1]!.res({ ...ownerData, context_docs: calls[1]!.docs });
    await waitFor(() => expect(screen.getByText("2 of 3 attached")).toBeInTheDocument());
  });

  it("toggles attach from the preview drawer", async () => {
    ownerData = agent([]);
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith("/repos/r1/context/document")) return Promise.resolve({ ...doc("docs/a.md"), text: "# Hi", tracked: false });
      if (path.startsWith("/repos/")) return Promise.resolve(listingData);
      return Promise.resolve(ownerData);
    });
    apiPut.mockImplementation((_u: string, body: { context_docs: string[] }) =>
      Promise.resolve({ ...ownerData, context_docs: body.context_docs }),
    );
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Preview docs/a.md" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("switch", { name: "Attached" }));
    await waitFor(() => expect(apiPut).toHaveBeenLastCalledWith("/agents/a1/context-docs", { context_docs: ["docs/a.md"] }));
    expect(await screen.findByText("1 of 3 attached")).toBeInTheDocument();
  });

  it("does not mark an attached path beyond a truncated listing as absent", async () => {
    ownerData = agent(["specs/beyond.md"]);
    listingData = listing({ truncated: true, total_found: 2500 });
    renderTab();
    expect(await screen.findByRole("switch", { name: "Attach specs/beyond.md" })).toBeChecked();
    expect(screen.queryByText("not in this repository")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2500 attached")).toBeInTheDocument();
  });

  it("covers the no-repo, no-clone and error states", async () => {
    ownerData = agent([]);
    activeRepoId = null;
    const { unmount } = renderTab();
    expect(await screen.findByText("Select a repository to attach its project documents.")).toBeInTheDocument();
    unmount();

    activeRepoId = "r1";
    listingData = listing({ clone_available: false, total_found: 0, documents: [] });
    const second = renderTab();
    expect(await screen.findByText("Clone not available")).toBeInTheDocument();
    second.unmount();

    listingData = listing();
    apiGet.mockImplementation((path: string) =>
      path.startsWith("/repos/") ? Promise.reject(new Error("boom")) : Promise.resolve(ownerData),
    );
    renderTab();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("ContextDocsTab (skill)", () => {
  it("shows the skill copy and the SERIALIZES AS preview", async () => {
    ownerData = skill(["specs/c.md", "docs/a.md"]);
    renderTab("skill");
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(await screen.findByText("2 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    expect(screen.getByText(/## Project context\s+- specs\/c\.md\s+- docs\/a\.md/)).toBeInTheDocument();
  });
});
