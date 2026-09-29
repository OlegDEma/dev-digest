import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\nAim for **5 high-signal** findings.\n\n## Correctness\n- Does it do what it claims?\n- Edge cases handled?\n\n```ts\nconst x = 1;\n```",
  enabled: true,
  version: 1,
  evidence_files: null,
};

describe("PreviewTab", () => {
  it("renders the body as real markdown: headings, bullets, emphasis and code", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <PreviewTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "PR Quality Rubric" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Correctness" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("5 high-signal").tagName).toBe("STRONG");
    expect(screen.getByText("const x = 1;").closest("pre")).not.toBeNull();
  });
});
