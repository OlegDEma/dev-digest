import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SegmentedToggle } from "./SegmentedToggle";

afterEach(cleanup);

describe("SegmentedToggle", () => {
  it("marks the active option, labels the group and reports clicks", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        ariaLabel="View"
        value="tree"
        onChange={onChange}
        options={[
          { value: "tree", label: "Tree" },
          { value: "graph", label: "Graph" },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(onChange).toHaveBeenCalledWith("graph");
  });
});
