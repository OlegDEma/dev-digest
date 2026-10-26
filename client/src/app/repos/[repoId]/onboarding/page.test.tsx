import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderIntl } from "./test-utils";

let params: { repoId: string } = { repoId: "_" };
vi.mock("next/navigation", () => ({ useParams: () => params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/OnboardingTourView", () => ({
  OnboardingTourView: ({ repoId }: { repoId: string }) => <div>tour for {repoId}</div>,
}));

import OnboardingTourPage from "./page";

afterEach(cleanup);

describe("OnboardingTourPage", () => {
  it("asks for a repository when none is selected, otherwise renders the view for that repo (AC-4)", () => {
    const first = renderIntl(<OnboardingTourPage />);
    expect(screen.getByText("Select a repository to see its onboarding tour.")).toBeInTheDocument();
    first.unmount();
    params = { repoId: "r1" };
    const second = renderIntl(<OnboardingTourPage />);
    expect(screen.getByText("tour for r1")).toBeInTheDocument();
    second.unmount();
    params = { repoId: "r2" };
    renderIntl(<OnboardingTourPage />);
    expect(screen.getByText("tour for r2")).toBeInTheDocument();
  });
});
