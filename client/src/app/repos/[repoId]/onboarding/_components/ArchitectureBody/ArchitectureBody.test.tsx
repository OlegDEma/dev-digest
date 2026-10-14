import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { renderIntl } from "../../test-utils";

let invalidate: (() => void) | undefined;
vi.mock("../../../../../../components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart, onInvalid }: { chart: string; onInvalid?: () => void }) => {
    invalidate = onInvalid;
    return <div data-testid="diagram">{chart}</div>;
  },
}));

import { ArchitectureBody } from "./ArchitectureBody";

afterEach(() => {
  cleanup();
  invalidate = undefined;
});

describe("ArchitectureBody", () => {
  it("renders the prose and the diagram (AC-45)", () => {
    renderIntl(<ArchitectureBody body={"A **layered** service."} diagram={"flowchart TD\n A-->B"} />);
    expect(screen.getByText("layered").tagName).toBe("STRONG");
    expect(screen.getByTestId("diagram")).toBeInTheDocument();
    expect(screen.queryByText("Diagram could not be rendered")).toBeNull();
  });

  it("keeps the prose and shows a note when the diagram is invalid (AC-62)", () => {
    renderIntl(<ArchitectureBody body="Prose stays." diagram="not mermaid" />);
    act(() => invalidate?.());
    expect(screen.getByText("Prose stays.")).toBeInTheDocument();
    expect(screen.getByText("Diagram could not be rendered")).toBeInTheDocument();
  });

  it("keeps the note when one invalid diagram is replaced by another invalid one (W3)", () => {
    const { rerender } = renderIntl(<ArchitectureBody body="p" diagram="bad one" />);
    act(() => invalidate?.());
    expect(screen.getByText("Diagram could not be rendered")).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ArchitectureBody body="p" diagram="bad two" />
      </NextIntlClientProvider>,
    );
    // fresh state after the remount; the new (also invalid) diagram reports again
    expect(screen.queryByText("Diagram could not be rendered")).toBeNull();
    act(() => invalidate?.());
    expect(screen.getByText("Diagram could not be rendered")).toBeInTheDocument();
  });

  it("renders no diagram area when there is no diagram (skeleton, AC-46)", () => {
    renderIntl(<ArchitectureBody body="Stack: pnpm · 10 TS files" diagram={null} />);
    expect(screen.queryByTestId("diagram")).toBeNull();
    expect(screen.getByText("Stack: pnpm · 10 TS files")).toBeInTheDocument();
  });

  it("does not execute or render raw HTML, and leaves javascript: links inert (AC-61)", () => {
    const body = [
      "<script>window.__pwned = 1</script>",
      "",
      '<img src="x" onerror="window.__pwned = 2">',
      "",
      "[click](javascript:alert(1)) and [ok](https://example.com)",
    ].join("\n");
    const { container } = renderIntl(<ArchitectureBody body={body} diagram={null} />);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("click").closest("a")).toBeNull();
    expect(screen.getByText("ok").closest("a")).toHaveAttribute("href", "https://example.com");
  });
});
