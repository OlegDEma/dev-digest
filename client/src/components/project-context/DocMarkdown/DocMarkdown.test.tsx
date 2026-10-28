import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DocMarkdown } from "./DocMarkdown";

afterEach(cleanup);

describe("DocMarkdown", () => {
  it("renders markdown, keeps raw script out of the DOM and makes only http(s) links clickable", () => {
    const { container } = render(
      <DocMarkdown>{[
        "# Title",
        "",
        "<script>window.__pwned = true</script>",
        "",
        "[bad](javascript:alert(1)) and [good](https://example.com/x)",
      ].join("\n")}</DocMarkdown>,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();

    expect(screen.getByRole("link", { name: "good" })).toHaveAttribute("href", "https://example.com/x");
    // The javascript: link is shown as plain text, not as an anchor.
    expect(screen.getByText("bad")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
  });
});
