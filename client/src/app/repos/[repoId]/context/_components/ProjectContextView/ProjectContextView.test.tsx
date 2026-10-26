import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { guardedNavigate } from "../../../../../../lib/nav-guard";
import type { DiscoveredDocument, DocumentContent, ProjectContextListing } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const refetch = vi.fn();
const saveMutate = vi.fn();
let listing: ProjectContextListing | undefined;
let contents: Record<string, DocumentContent>;

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../../../lib/hooks/project-context", () => ({
  useProjectContext: () => ({ data: listing, isLoading: false, isError: false, isFetching: false, refetch }),
  useContextDocument: (_repo: string, path: string) => ({ data: contents[path], isLoading: false, isError: false }),
  useSaveContextDocument: () => ({ mutate: saveMutate, isPending: false }),
}));

import { ProjectContextView } from "./ProjectContextView";

const doc = (path: string, over: Partial<DiscoveredDocument> = {}): DiscoveredDocument => ({
  path,
  folder: path.split("/").slice(0, -1).join("/"),
  name: path.split("/").pop()!,
  bucket: path.split("/")[0]!,
  size_bytes: 10,
  status: "ok",
  estimated_tokens: 50,
  used_by_agents: 2,
  ...over,
});

const content = (path: string, text: string, tracked = false): DocumentContent => ({ ...doc(path), text, tracked });

beforeEach(() => {
  listing = {
    repo_id: "r1",
    clone_available: true,
    total_found: 3,
    truncated: false,
    documents: [doc("specs/b.md"), doc("docs/a.md"), doc("docs/z.md")],
  };
  contents = {
    "docs/a.md": content("docs/a.md", "# Alpha\n\nraw *text*", true),
    "docs/z.md": content("docs/z.md", "# Zed", false),
    "specs/b.md": content("specs/b.md", "# Bee"),
  };
});

afterEach(() => {
  cleanup();
  refetch.mockReset();
  push.mockReset();
  saveMutate.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("groups documents by folder in path order, previews one with its metadata and refreshes", () => {
    renderView();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["docs", "specs"]);
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "docs/a.md" }));
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.getAllByText("≈ 50 tokens").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("edits raw text, warns only for tracked files, keeps the text when saving fails and saves on success", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs/a.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "Edit docs/a.md" });
    expect(editor).toHaveValue("# Alpha\n\nraw *text*");
    expect(screen.getByRole("note")).toHaveTextContent(/Resync/);

    fireEvent.change(editor, { target: { value: "changed" } });
    saveMutate.mockImplementation((_body, opts) => opts.onError(new Error("413 document too large")));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveMutate).toHaveBeenCalledWith({ path: "docs/a.md", text: "changed" }, expect.any(Object));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save: 413 document too large");
    expect(screen.getByRole("textbox", { name: "Edit docs/a.md" })).toHaveValue("changed");

    saveMutate.mockImplementation((_body, opts) => opts.onSuccess());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("shows no tracked warning for an untracked file", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs/z.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("asks before discarding unsaved text when another document is selected; cancel keeps the text", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs/a.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit docs/a.md" }), { target: { value: "unsaved" } });

    fireEvent.click(screen.getByRole("button", { name: "docs/z.md" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Edit docs/a.md" })).toHaveValue("unsaved");

    fireEvent.click(screen.getByRole("button", { name: "docs/z.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("heading", { name: "Zed" })).toBeInTheDocument();
  });

  function makeDirty() {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs/a.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit docs/a.md" }), { target: { value: "unsaved" } });
  }

  it("holds programmatic navigation (palette, repo switcher, shortcuts) behind the confirm while dirty", () => {
    makeDirty();
    const go = vi.fn();
    act(() => guardedNavigate(go));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(go).not.toHaveBeenCalled();

    act(() => guardedNavigate(go));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("navigates immediately when the editor is clean", () => {
    renderView();
    const go = vi.fn();
    guardedNavigate(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it.each([["Back", "/repos/r0/pulls"], ["Forward", "/repos/r9/context?x=1#h"]])(
    "intercepts %s while dirty: re-pushes the URL, asks, and confirming pushes the captured destination",
    (_dir, dest) => {
      makeDirty();
      const here = window.location.href;
      window.history.replaceState(null, "", dest);
      const pushState = vi.spyOn(window.history, "pushState");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(pushState).toHaveBeenCalledWith(null, "", here);
      expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
      expect(push).toHaveBeenCalledWith(dest);
      pushState.mockRestore();
    },
  );

  it("cancelling the Back confirm stays on the page", () => {
    makeDirty();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Edit docs/a.md" })).toHaveValue("unsaved");
  });

  it("a second dirty session after a confirm still intercepts Back", () => {
    makeDirty();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    cleanup();
    push.mockClear();
    makeDirty();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the empty, clone-not-available and truncated states", () => {
    listing = { ...listing!, documents: [], total_found: 0 };
    const first = renderView();
    expect(screen.getByText("No project documents yet")).toBeInTheDocument();
    first.unmount();

    listing = { ...listing!, clone_available: false };
    const second = renderView();
    expect(screen.getByText("Clone not available")).toBeInTheDocument();
    second.unmount();

    listing = {
      repo_id: "r1",
      clone_available: true,
      total_found: 2500,
      truncated: true,
      documents: [doc("docs/a.md")],
    };
    renderView();
    expect(screen.getByText("Showing 1 of 2500 documents")).toBeInTheDocument();
  });

  it("marks a too-large document with no preview", () => {
    listing = { ...listing!, documents: [doc("docs/big.md", { status: "too_large", estimated_tokens: null })] };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "docs/big.md" }));
    expect(screen.getByText("Too large (over 512 KB)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
