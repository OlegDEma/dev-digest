import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false },
  mutate: vi.fn(),
  pending: false,
}));

vi.mock("../../../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => state.query,
  useRecomputeIntent: () => ({ mutate: state.mutate, isPending: state.pending }),
}));

import { IntentCard } from "./IntentCard";

afterEach(cleanup);
beforeEach(() => {
  state.query = { data: undefined, isLoading: false, isError: false };
  state.mutate = vi.fn();
  state.pending = false;
});

const record: PrIntentRecord = {
  pr_id: "p1",
  summary: "Add rate limiting to the public API",
  in_scope: ["Rate limiter middleware"],
  out_of_scope: ["Auth rewrite"],
  risk_areas: [{ label: "Public endpoints", kind: "api" }],
  missing_context: ["https://down.test/x"],
  confidence: "low",
  head_sha: "abc",
  sources: [
    { kind: "repo_doc", ref: "specs/plan.md", status: "used", reason: null, tokens: 40 },
    { kind: "url", ref: "https://down.test/x", status: "unresolved", reason: "HTTP 500", tokens: 0 },
  ],
  model: "openai/gpt-6-luna",
  tokens_in: 900,
  tokens_out: 100,
  cost_usd: 0.0012,
  diff_tokens_saved: 3500,
  computed_at: "2026-09-30T00:00:00Z",
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard prId="p1" pollWhileRunning={false} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders summary, scope lists, chips, badges and flags unresolved sources", () => {
    state.query = { data: { intent: record, stale: true }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByText(/Add rate limiting to the public API/)).toBeInTheDocument();
    expect(screen.getByText("Rate limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Auth rewrite")).toBeInTheDocument();
    expect(screen.getByText("Public endpoints")).toBeInTheDocument();
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText("PR updated since intent was derived")).toBeInTheDocument();
    expect(screen.getByText("https://down.test/x", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText(/saved 3500 diff tokens/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
    expect(screen.getByText(/url · https:\/\/down\.test\/x · unresolved — HTTP 500/)).toBeInTheDocument();
    expect(screen.getByText(/repo_doc · specs\/plan\.md · used/)).toBeInTheDocument();
  });

  it("recompute triggers the mutation and is disabled while pending", () => {
    state.query = { data: { intent: record, stale: false }, isLoading: false, isError: false };
    const { rerender } = renderCard();
    expect(screen.queryByText("PR updated since intent was derived")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(state.mutate).toHaveBeenCalledTimes(1);

    state.pending = true;
    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <IntentCard prId="p1" pollWhileRunning={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Recompute" })).toBeDisabled();
  });

  it("empty state offers Derive intent, which triggers the mutation", () => {
    state.query = { data: { intent: null, stale: false }, isLoading: false, isError: false };
    renderCard();
    expect(screen.getByText("No intent yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the title inside the card while loading and on error", () => {
    for (const q of [
      { data: undefined, isLoading: true, isError: false },
      { data: undefined, isLoading: false, isError: true, error: new Error("boom") },
    ]) {
      state.query = q as never;
      renderCard();
      const title = screen.getByText("Intent");
      expect(title.closest("section")!.firstElementChild).toContainElement(title);
      cleanup();
    }
  });
});
