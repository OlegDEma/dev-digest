import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { FileRows } from "./FileRows";
import { renderIntl, sections } from "../../test-utils";
import type { OnboardingCriticalPathItem, OnboardingReadingPathItem } from "@devdigest/shared";

afterEach(cleanup);

const critical = sections()[1]!.items as OnboardingCriticalPathItem[];
const reading = sections()[3]!.items as OnboardingReadingPathItem[];
const base = { repoFullName: "acme/payments-api", sha: "abc123", defaultBranch: "main" };

describe("FileRows", () => {
  it("renders an Open link pinned to the SHA, in a new tab, with the full path in its name (AC-57, AC-63)", () => {
    renderIntl(<FileRows {...base} rows={critical.map((item) => ({ kind: "critical" as const, item }))} />);
    const open = screen.getByRole("link", { name: "Open src/core/engine.ts on GitHub" });
    expect(open).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/core/engine.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("The review engine.")).toBeInTheDocument();
  });

  it("falls back to the default branch when the SHA is null (AC-57)", () => {
    renderIntl(<FileRows {...base} sha={null} rows={critical.map((item) => ({ kind: "critical" as const, item }))} />);
    expect(screen.getByRole("link", { name: /Open src\/core\/engine.ts/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/core/engine.ts",
    );
  });

  it("middle-truncates a 200-character path but keeps the full path in the link name (AC-63, EC-23)", () => {
    const longPath = `src/${"d".repeat(190)}.ts`;
    const rows = [{ kind: "critical" as const, item: { ...critical[0]!, path: longPath } }];
    renderIntl(<FileRows {...base} rows={rows} />);
    const shown = screen.getByText(/^src\/d+….*\.ts$/);
    expect(shown.textContent!.length).toBeLessThan(longPath.length);
    expect(screen.getByRole("link", { name: `Open ${longPath} on GitHub` })).toBeInTheDocument();
  });

  it("shows order, reason and 'top N%' on reading rows, plus the note (AC-50, AC-51)", () => {
    renderIntl(<FileRows {...base} rankedByImportGraph rows={reading.map((item) => ({ kind: "reading" as const, item }))} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Start here.")).toBeInTheDocument();
    expect(screen.getByText("top 2%")).toBeInTheDocument();
    expect(screen.getByText("Ranked by import graph")).toBeInTheDocument();
  });

  it("omits the note when ranking is not import-graph only", () => {
    renderIntl(<FileRows {...base} rows={reading.map((item) => ({ kind: "reading" as const, item }))} />);
    expect(screen.queryByText("Ranked by import graph")).toBeNull();
  });

  it("shows 'No ranked files' when empty (AC-74)", () => {
    renderIntl(<FileRows {...base} rows={[]} />);
    expect(screen.getByText("No ranked files")).toBeInTheDocument();
  });
});
