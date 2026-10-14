import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/context.json";

let params: { repoId: string } = { repoId: "_" };
vi.mock("next/navigation", () => ({ useParams: () => params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/ProjectContextView", () => ({
  ProjectContextView: ({ repoId }: { repoId: string }) => <div>view for {repoId}</div>,
}));

import ProjectContextPage from "./page";

afterEach(cleanup);

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextPage />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextPage", () => {
  it("asks for a repository when none is selected, otherwise renders the view", () => {
    const first = renderPage();
    expect(screen.getByText("Select a repository to browse its project documents.")).toBeInTheDocument();
    first.unmount();
    params = { repoId: "r1" };
    renderPage();
    expect(screen.getByText("view for r1")).toBeInTheDocument();
  });
});
