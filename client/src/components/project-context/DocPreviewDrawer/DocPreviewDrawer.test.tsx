import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DiscoveredDocument } from "@devdigest/shared";
import messages from "../../../../messages/en/context.json";

vi.mock("../../../lib/hooks/project-context", () => ({
  useContextDocument: (_repo: string, path: string, enabled: boolean) => ({
    data: enabled ? { text: `# Heading of ${path}` } : undefined,
    isLoading: false,
    isError: false,
  }),
}));

import { DocPreviewDrawer } from "./DocPreviewDrawer";

afterEach(cleanup);

const doc = (over: Partial<DiscoveredDocument> = {}): DiscoveredDocument => ({
  path: "docs/specs/arch.md",
  folder: "docs/specs",
  name: "arch.md",
  bucket: "docs",
  size_bytes: 100,
  status: "ok",
  estimated_tokens: 178,
  used_by_agents: 3,
  ...over,
});

function renderDrawer(d: DiscoveredDocument, extra: Partial<React.ComponentProps<typeof DocPreviewDrawer>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocPreviewDrawer repoId="r1" doc={d} onClose={() => {}} {...extra} />
    </NextIntlClientProvider>,
  );
}

describe("DocPreviewDrawer", () => {
  it("shows the rendered markdown with path, bucket, usage and tokens, and toggles Attached", async () => {
    const onToggle = vi.fn();
    renderDrawer(doc(), { attached: false, onToggleAttached: onToggle });
    expect(screen.getByRole("heading", { name: "Heading of docs/specs/arch.md" })).toBeInTheDocument();
    expect(screen.getByText("docs/specs/arch.md")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("≈ 178 tokens")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Attached" }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("uses the singular for one agent", () => {
    renderDrawer(doc({ used_by_agents: 1 }));
    expect(screen.getByText("Used by 1 agent")).toBeInTheDocument();
  });

  it("shows a marker and disables the switch for a too-large document", () => {
    renderDrawer(doc({ status: "too_large", estimated_tokens: null }), { attached: false, onToggleAttached: vi.fn() });
    expect(screen.getByText("Too large (over 512 KB)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Attached" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: /Heading of/ })).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <NextIntlClientProvider locale="en" messages={{ context: messages }}>
          <button onClick={() => setOpen(true)}>open it</button>
          {open && <DocPreviewDrawer repoId="r1" doc={doc()} onClose={() => setOpen(false)} />}
        </NextIntlClientProvider>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "open it" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
