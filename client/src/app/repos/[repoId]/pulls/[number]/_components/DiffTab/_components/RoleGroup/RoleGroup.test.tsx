import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiffRole } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import { RoleGroup } from "./RoleGroup";

afterEach(cleanup);

const FILES = [
  { path: "src/x.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+b" },
  { path: "src/y.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n c\n+d" },
];

function setup(role: SmartDiffRole, findingFiles: number | null, files = FILES, findingCount = 0) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <RoleGroup role={role} files={files} findingFiles={findingFiles} findingCount={findingCount} />
    </NextIntlClientProvider>,
  );
}

const toggle = () => screen.getByRole("button", { expanded: false });

describe("RoleGroup", () => {
  it.each(["core", "tests", "wiring", "docs", "boilerplate"] as const)("%s starts collapsed", (role) => {
    setup(role, 0);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/x.ts")).toBeNull();
  });

  it("a header click opens and closes the group", () => {
    setup("core", 0);
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText("src/x.ts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("src/x.ts")).toBeNull();
  });

  it("an empty group shows '0 files' and cannot be expanded", () => {
    setup("wiring", 0, []);
    expect(screen.getByText("0 files")).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
    expect(screen.getByRole("button", { name: /all files/ })).toBeDisabled();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("collapse-all folds every file to its header, a second click expands them all", () => {
    setup("core", 0);
    fireEvent.click(toggle());
    expect(screen.getAllByText("b")).toHaveLength(1);
    expect(screen.getByText("d")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all files" }));
    expect(screen.queryByText("b")).toBeNull();
    expect(screen.queryByText("d")).toBeNull();
    expect(screen.getByText("src/x.ts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all files" }));
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("d")).toBeInTheDocument();
  });

  it("per-file toggling still works after collapse-all", () => {
    setup("core", 0);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Collapse all files" }));
    fireEvent.click(screen.getByText("src/x.ts"));
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.queryByText("d")).toBeNull();
  });

  it("shows ● N, with a title and screen-reader text for files and findings", () => {
    setup("core", 2, FILES, 5);
    const dot = screen.getByText("● 2");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot.parentElement).toHaveAttribute("title", "2 files with findings · 5 findings");
    expect(screen.getByText("2 files with findings · 5 findings")).toBeInTheDocument();
  });

  it("uses singular forms in the counter label", () => {
    setup("core", 1, FILES, 1);
    expect(screen.getByText("1 file with findings · 1 finding")).toBeInTheDocument();
  });

  it("first collapse-all click expands when no file auto-expands (all large)", () => {
    const big = FILES.map((f) => ({ ...f, additions: 500 }));
    setup("core", 0, big);
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Expand all files" })).toBeInTheDocument();
  });

  it("shows neither dot nor 'Review not run yet' for zero findings", () => {
    setup("core", 0);
    expect(screen.queryByText(/●/)).toBeNull();
    expect(screen.queryByText("Review not run yet")).toBeNull();
  });

  it("shows 'Review not run yet' and no dot when null", () => {
    setup("core", null);
    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    expect(screen.queryByText(/●/)).toBeNull();
  });
});
