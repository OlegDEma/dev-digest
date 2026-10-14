import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MermaidDiagram } from "./MermaidDiagram";

afterEach(cleanup);

describe("MermaidDiagram onInvalid", () => {
  it("calls onInvalid when the source is not a mermaid diagram (AC-62)", async () => {
    const onInvalid = vi.fn();
    render(<MermaidDiagram chart="just prose" onInvalid={onInvalid} />);
    await waitFor(() => expect(onInvalid).toHaveBeenCalled());
  });

  it("still renders nothing without an onInvalid prop (existing callers)", () => {
    const { container } = render(<MermaidDiagram chart="just prose" />);
    expect(container.firstChild).toBeNull();
  });
});
