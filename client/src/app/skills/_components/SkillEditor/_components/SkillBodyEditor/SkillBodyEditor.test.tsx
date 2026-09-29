import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { classifyLine, splitLines } from "./helpers";
import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(cleanup);

function renderEditor(props: Partial<React.ComponentProps<typeof SkillBodyEditor>> = {}) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillBodyEditor value={"# Title\n\n- one\n## Sub"} onChange={onChange} fileName="my-skill.md" {...props} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe("SkillBodyEditor helpers", () => {
  it("classifies markdown headings only", () => {
    expect(classifyLine("# Title")).toBe("heading");
    expect(classifyLine("###### deep")).toBe("heading");
    expect(classifyLine("#hashtag")).toBe("text");
    expect(classifyLine("- item")).toBe("text");
  });

  it("splits into editor lines, keeping a trailing empty line", () => {
    expect(splitLines("")).toEqual([""]);
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
  });
});

describe("SkillBodyEditor", () => {
  it("shows the file name, token estimate, one gutter number per line and tints headings", () => {
    renderEditor();
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    // "# Title\n\n- one\n## Sub" = 22 chars → ceil(22/4) = 6 tokens.
    expect(screen.getByText("6 tokens")).toBeInTheDocument();
    const gutter = screen.getByTestId("gutter");
    expect(gutter.textContent).toBe("1234");
    const layer = screen.getByTestId("highlight");
    const kinds = Array.from(layer.querySelectorAll("[data-line-kind]")).map((el) => el.getAttribute("data-line-kind"));
    expect(kinds).toEqual(["heading", "text", "text", "heading"]);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("marks unsaved and forwards edits from the textarea", () => {
    const { onChange } = renderEditor({ dirty: true });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "my-skill.md" }), { target: { value: "# New" } });
    expect(onChange).toHaveBeenCalledWith("# New");
  });

  it("draws the placeholder in the layer when the body is empty", () => {
    renderEditor({ value: "", placeholder: "# Rule\n\nWhen reviewing…" });
    const layer = screen.getByTestId("highlight");
    expect(within(layer).getByText("# Rule")).toBeInTheDocument();
    expect(screen.getByTestId("gutter").textContent).toBe("1");
    expect(screen.getByText("0 tokens")).toBeInTheDocument();
  });
});
