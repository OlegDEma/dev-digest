import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDoc } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { ProjectContextBlock } from "./ProjectContextBlock";

afterEach(cleanup);

const injected = (path: string, tokens: number, text: string): ProjectContextDoc => ({
  path,
  repo: "acme/api",
  status: "injected",
  reason: null,
  estimated_tokens: tokens,
  wrapped_text: text,
});

const skipped = (path: string, reason: ProjectContextDoc["reason"]): ProjectContextDoc => ({
  path,
  repo: "acme/api",
  status: "skipped",
  reason,
  estimated_tokens: null,
  wrapped_text: null,
});

function renderBlock(docs: ProjectContextDoc[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ProjectContextBlock docs={docs} />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextBlock", () => {
  it("shows one item per injected document and expands to its wrapped text with search and copy", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    renderBlock([
      injected("specs/a.md", 120, "<untrusted>\nlayering rule\nsecond line\n</untrusted>"),
      injected("docs/b.md", 80, "<untrusted>\nother\n</untrusted>"),
      skipped("docs/gone.md", "not_found"),
    ]);

    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    // total = 200 tokens
    expect(screen.getByText("~200 tokens")).toBeInTheDocument();
    expect(screen.getByText("~120 tokens")).toBeInTheDocument();
    expect(screen.getByText("~80 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("acme/api")).toHaveLength(2);
    expect(screen.queryByText(/layering rule/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^specs\/a\.md/ }));
    expect(screen.getByText(/layering rule/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search in this document…" }), { target: { value: "LAYERING" } });
    expect(screen.getByText("LAYERING".toLowerCase(), { selector: "mark" })).toBeInTheDocument();
    expect(screen.queryByText(/second line/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy specs/a.md" }));
    expect(writeText).toHaveBeenCalledWith("<untrusted>\nlayering rule\nsecond line\n</untrusted>");

    // Skipped list with the reason.
    expect(screen.getByText("docs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
  });

  it("still lists skipped documents when nothing was injected", () => {
    renderBlock([skipped("a.md", "too_large"), skipped("b.md", "no_clone")]);
    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("too large")).toBeInTheDocument();
    expect(screen.getByText("no clone")).toBeInTheDocument();
  });
});
