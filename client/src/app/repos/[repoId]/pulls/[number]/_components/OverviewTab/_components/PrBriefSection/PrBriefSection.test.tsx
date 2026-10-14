import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { PrBriefSection, type PrBriefSectionProps } from "./PrBriefSection";

afterEach(cleanup);

const brief: PrBrief = {
  intent: null,
  blast: null,
  risks: { risks: [] },
  history: null,
  summary: "Adds a rate limiter",
  review_focus: [],
  head_sha: "abcdef1234567",
  generated_at: "2026-10-12T10:00:00Z",
  provider: "openai",
  model: "gpt-x",
  calls: 1,
  attempts: 2,
  input_tokens: 1200,
  input_budget: 8000,
  tokens_in: 1300,
  tokens_out: 300,
  cost_usd: 0.0123,
  missing_inputs: [],
  specs: [],
  reductions: [],
  dropped: { risks: 0, risk_refs: 0, review_focus: 0 },
  corrected_lines: 0,
};

function base(over: Partial<PrBriefSectionProps> = {}): PrBriefSectionProps {
  return {
    isLoading: false,
    loadError: null,
    onRetry: vi.fn(),
    brief: null,
    stale: false,
    generating: false,
    generateError: null,
    onGenerate: vi.fn(),
    ...over,
  };
}

function renderIt(props: PrBriefSectionProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefSection {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefSection", () => {
  it("AC-1: offers Generate brief when no brief is stored; one click calls once (AC-3)", () => {
    const p = base();
    renderIt(p);
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(p.onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-2: skeleton while the GET is pending, no button", () => {
    const { container } = renderIt(base({ isLoading: true }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("AC-4/66: first generation shows a skeleton and disables Generate", () => {
    renderIt(base({ generating: true }));
    expect(screen.getByTestId("brief-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
  });

  it("AC-6: GET failure shows the message and Retry inside the section", () => {
    const p = base({ loadError: new Error("boom") });
    renderIt(p);
    expect(screen.getByText("Could not load the brief")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });

  it("AC-5: renders the summary; AC-36/66: previous brief stays and Refresh is disabled while pending", () => {
    renderIt(base({ brief, generating: true }));
    expect(screen.getByText("Adds a rate limiter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("AC-35: Refresh calls onGenerate once", () => {
    const p = base({ brief });
    renderIt(p);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(p.onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-39: a failed refresh keeps the previous brief and shows the server message", () => {
    renderIt(base({ brief, generateError: new Error("Brief generation failed: timeout") }));
    expect(screen.getByText("Adds a rate limiter")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Brief generation failed: timeout");
  });

  it("AC-39: a failed first generation keeps the Generate button and shows the message", () => {
    renderIt(base({ generateError: new Error("No API key configured for openai. Add one in Settings.") }));
    expect(screen.getByRole("alert")).toHaveTextContent("No API key configured for openai");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
  });

  it("AC-40: an 801-char summary is cut to 800 chars plus an ellipsis; 800 is untouched", () => {
    renderIt(base({ brief: { ...brief, summary: "a".repeat(801) } }));
    expect(screen.getByText("a".repeat(800) + "…")).toBeInTheDocument();
    cleanup();
    renderIt(base({ brief: { ...brief, summary: "b".repeat(800) } }));
    expect(screen.getByText("b".repeat(800))).toBeInTheDocument();
  });

  it("AC-32: stale badge only when stale, brief stays visible", () => {
    renderIt(base({ brief, stale: true }));
    expect(screen.getByText("PR updated since brief was generated")).toBeInTheDocument();
    expect(screen.getByText("Adds a rate limiter")).toBeInTheDocument();
    cleanup();
    renderIt(base({ brief }));
    expect(screen.queryByText("PR updated since brief was generated")).not.toBeInTheDocument();
  });

  it("AC-47: Generated without line lists missing inputs and skipped specs; absent when nothing is missing", () => {
    renderIt(
      base({
        brief: {
          ...brief,
          missing_inputs: [{ input: "intent", reason: "not derived yet" }],
          specs: [
            { path: "docs/a.md", status: "skipped", reason: "too_large", tokens: null },
            { path: "docs/b.md", status: "used", reason: null, tokens: 10 },
          ],
        },
      }),
    );
    const line = screen.getByText(/Generated without:/);
    expect(line).toHaveTextContent("intent");
    expect(line).toHaveTextContent("docs/a.md (too large)");
    expect(line).not.toHaveTextContent("docs/b.md");
    cleanup();
    renderIt(base({ brief }));
    expect(screen.queryByText(/Generated without:/)).not.toBeInTheDocument();
  });

  it("AC-48: provenance footer, with cost unknown when cost is null", () => {
    renderIt(base({ brief }));
    const footer = screen.getByText(/gpt-x/);
    expect(footer).toHaveTextContent("1200/8000 tokens in");
    expect(footer).toHaveTextContent("300 out");
    expect(footer).toHaveTextContent("$0.0123");
    expect(footer).toHaveTextContent("2 attempts");
    expect(footer).toHaveTextContent("abcdef1");
    expect(footer).not.toHaveTextContent("abcdef12");
    cleanup();
    renderIt(base({ brief: { ...brief, cost_usd: null, attempts: 1 } }));
    expect(screen.getByText(/gpt-x/)).toHaveTextContent("cost unknown");
    expect(screen.getByText(/gpt-x/)).toHaveTextContent("1 attempt ");
  });

  it("AC-49: dropped note is plural-aware and corrected note shows when lines were adjusted", () => {
    renderIt(
      base({ brief: { ...brief, dropped: { risks: 1, risk_refs: 1, review_focus: 1 }, corrected_lines: 1 } }),
    );
    expect(screen.getByText(/3 items dropped: file not in this PR or its blast map/)).toBeInTheDocument();
    expect(screen.getByText("1 line adjusted")).toBeInTheDocument();
    cleanup();
    renderIt(base({ brief: { ...brief, dropped: { risks: 1, risk_refs: 0, review_focus: 0 } } }));
    expect(screen.getByText(/^1 item dropped/)).toBeInTheDocument();
    expect(screen.queryByText(/adjusted/)).not.toBeInTheDocument();
  });

  it("AC-61: HTML in the summary is rendered as text, not markup", () => {
    const { container } = renderIt(base({ brief: { ...brief, summary: "<script>alert(1)</script><b>x</b>" } }));
    expect(screen.getByText("<script>alert(1)</script><b>x</b>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
