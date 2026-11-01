import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseContextReport } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { ContextSummary } from "./ContextSummary";

afterEach(cleanup);

const base: EvalCaseContextReport = { files_included: 2, files_skipped: [], files_unavailable: 0, pr_meta: "attached" };
const mount = (over: Partial<EvalCaseContextReport> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <ContextSummary report={{ ...base, ...over }} />
    </NextIntlClientProvider>,
  );

describe("ContextSummary", () => {
  it("renders files and meta variants", () => {
    mount({ files_included: 0, pr_meta: "empty" });
    expect(screen.getByText("Context: 0 files from the PR · no PR meta")).toBeInTheDocument();
    cleanup();
    mount({ files_included: 1, pr_meta: "truncated" });
    expect(screen.getByText("Context: 1 file from the PR · PR meta attached (truncated)")).toBeInTheDocument();
  });

  it("shows skipped / unavailable parts only when non-empty", () => {
    mount();
    expect(screen.queryByText(/skipped/)).toBeNull();
    expect(screen.queryByText(/no diff available/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    mount({ files_skipped: [{ path: "a", reason: "file_size" }], files_unavailable: 1 });
    expect(
      screen.getByText("Context: 2 files from the PR · PR meta attached · 1 file skipped (limit) · 1 PR file had no diff available"),
    ).toBeInTheDocument();
  });

  it("toggle is a button with aria-expanded, focusable native control, listing each reason text", () => {
    const reasons = ["no_diff", "path_too_long", "file_size", "files_count", "files_total"] as const;
    mount({ files_skipped: reasons.map((r, i) => ({ path: `p${i}.ts`, reason: r })) });
    const btn = screen.getByRole("button", { name: "Show skipped files" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("type", "button");
    btn.focus();
    expect(btn).toHaveFocus();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    for (const text of [
      "p0.ts — no diff (binary or empty change)",
      "p1.ts — path over 300 characters",
      "p2.ts — over 64 KB",
      "p3.ts — over the 10-file limit",
      "p4.ts — over the 256 KB total",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("lists 20 skips and 'and 5 more' for 25", () => {
    mount({ files_skipped: Array.from({ length: 25 }, (_, i) => ({ path: `f${i}.ts`, reason: "files_count" as const })) });
    fireEvent.click(screen.getByRole("button", { name: "Show skipped files" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(21);
    expect(screen.getByText("and 5 more")).toBeInTheDocument();
    expect(screen.queryByText(/f20\.ts/)).toBeNull();
  });

  it("renders a markup-looking path as literal text", () => {
    mount({ files_skipped: [{ path: "<b>x</b>", reason: "no_diff" }] });
    fireEvent.click(screen.getByRole("button", { name: "Show skipped files" }));
    expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("li b")).toBeNull();
  });
});
