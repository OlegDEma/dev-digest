import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { RunCommands } from "./RunCommands";
import { renderIntl } from "../../test-utils";
import type { OnboardingRunCommandItem } from "@devdigest/shared";

afterEach(cleanup);

const items: OnboardingRunCommandItem[] = [
  { order: 1, command: "pnpm install", annotation: null, source_path: "package.json" },
  { order: 2, command: "pnpm run dev", annotation: "starts the API\n rm -rf /", source_path: "package.json" },
];

describe("RunCommands", () => {
  it("copies exactly the command text and confirms 'Copied' (AC-58)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderIntl(<RunCommands items={items} skipped={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy command pnpm install" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("pnpm install");
  });

  it("renders the annotation on one line and never copies it (AC-59)", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderIntl(<RunCommands items={items} skipped={[]} />);
    const note = screen.getByText("starts the API rm -rf /");
    expect(note.textContent).not.toMatch(/[\n\r]/);
    fireEvent.click(screen.getByRole("button", { name: "Copy command pnpm run dev" }));
    expect(writeText).toHaveBeenCalledWith("pnpm run dev");
  });

  it("shows the no-manifest text when there are no commands (AC-42)", () => {
    renderIntl(<RunCommands items={[]} skipped={[]} />);
    expect(
      screen.getByText("No package.json found at the repository root or one level below — run commands unavailable."),
    ).toBeInTheDocument();
  });

  it("lists skipped files with their reason (AC-43)", () => {
    renderIntl(<RunCommands items={items} skipped={[{ path: "packages/a/package.json", reason: "invalid_json" }]} />);
    expect(screen.getByText("Skipped files")).toBeInTheDocument();
    expect(screen.getByText("packages/a/package.json")).toBeInTheDocument();
    expect(screen.getByText(/invalid JSON/)).toBeInTheDocument();
  });
});
