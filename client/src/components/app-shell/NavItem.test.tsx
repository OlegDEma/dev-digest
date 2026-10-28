import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NavItem, NAV } from "@devdigest/ui";

afterEach(cleanup);

const item = NAV[0]!.items.find((i) => i.key === "onboarding-tour")!;

describe("NavItem aria-current", () => {
  it("marks the active item aria-current=page (AC-2, NFR-6)", () => {
    render(<NavItem item={item} active repoId="r1" />);
    const link = screen.getByRole("link", { name: /Onboarding Tour/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("href", "/repos/r1/onboarding");
  });

  it("omits aria-current on an inactive item", () => {
    render(<NavItem item={item} repoId="r1" />);
    expect(screen.getByRole("link", { name: /Onboarding Tour/ })).not.toHaveAttribute("aria-current");
  });
});
