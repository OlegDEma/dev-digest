import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { BriefRiskAreas } from "./BriefRiskAreas";

afterEach(cleanup);

const risks: Risk[] = [
  {
    kind: "security",
    title: "Secret in config",
    explanation: "A key is committed",
    severity: "high",
    file_refs: ["src/config.ts:10-20", "src/other.ts:5", "README.md"],
  },
  { kind: "perf", title: "Slow loop", explanation: "O(n^2)", severity: "medium", file_refs: ["src/a.ts:1"] },
  { kind: "style", title: "Naming", explanation: "meh", severity: "low", file_refs: [] },
];

function renderIt(rs: Risk[], onOpenRef = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <BriefRiskAreas risks={rs} onOpenRef={onOpenRef} />
    </NextIntlClientProvider>,
  );
  return onOpenRef;
}

describe("BriefRiskAreas", () => {
  it("AC-41: row shows title, severity-coloured icon and only the first ref", () => {
    renderIt(risks);
    expect(screen.getByText("Secret in config")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "High" })).toHaveStyle({ color: "var(--crit)" });
    expect(screen.getByRole("img", { name: "Medium" })).toHaveStyle({ color: "var(--warn)" });
    expect(screen.getByRole("img", { name: "Low" })).toHaveStyle({ color: "var(--text-muted)" });
    expect(screen.getByText("src/config.ts:10-20")).toBeInTheDocument();
    expect(screen.queryByText("src/other.ts:5")).not.toBeInTheDocument();
    expect(screen.queryByText("A key is committed")).not.toBeInTheDocument();
  });

  it("AC-42: expanding toggles aria-expanded and shows explanation + remaining refs", () => {
    renderIt(risks);
    const toggle = screen.getByRole("button", { name: "Show details: Secret in config" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide details: Secret in config" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("A key is committed")).toBeInTheDocument();
    expect(screen.getByText("src/other.ts:5")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("AC-56/NFR-5: ref click opens file at the range start with an accessible name; bare path has null line", () => {
    const open = renderIt(risks);
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts line 10 in Files changed" }));
    expect(open).toHaveBeenCalledWith("src/config.ts", 10);
    fireEvent.click(screen.getByRole("button", { name: "Show details: Secret in config" }));
    fireEvent.click(screen.getByRole("button", { name: "Open README.md in Files changed" }));
    expect(open).toHaveBeenLastCalledWith("README.md", null);
  });

  it("AC-46: empty list shows the no-risks copy", () => {
    renderIt([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("AC-61: model text is rendered as text", () => {
    renderIt([{ ...risks[0]!, title: "<img src=x onerror=alert(1)>" }]);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
