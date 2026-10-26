import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { FirstTasks } from "./FirstTasks";
import { renderIntl } from "../../test-utils";
import type { OnboardingFirstTaskItem } from "@devdigest/shared";

afterEach(cleanup);

const task = (n: number): OnboardingFirstTaskItem => ({
  title: `Task ${n}`,
  rationale: `Because ${n}`,
  paths: [`src/f${n}.ts`, `src/g${n}.ts`],
});

describe("FirstTasks", () => {
  it("renders every task with title, rationale and Open links per path (AC-52)", () => {
    renderIntl(<FirstTasks items={[1, 2, 3, 4].map(task)} repoFullName="acme/x" sha="abc" defaultBranch="main" />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.getByText("Because 2")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: "Open src/f1.ts on GitHub" });
    expect(open).toHaveAttribute("href", "https://github.com/acme/x/blob/abc/src/f1.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });
});
