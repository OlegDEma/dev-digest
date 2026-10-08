import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { SymbolGroup } from "./SymbolGroup";

afterEach(cleanup);

const hrefFor = (file: string, line: number) => `https://github.com/acme/w/blob/idx1/${file}#L${line}`;

function renderGroup(group: Parameters<typeof SymbolGroup>[0]["group"], cap = 5, defaultOpen = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <SymbolGroup group={group} cap={cap} defaultOpen={defaultOpen} hrefFor={hrefFor} />
    </NextIntlClientProvider>,
  );
}

const one = {
  symbol: "getContext",
  callers: [{ name: "intentRoutes", file: "src/a.ts", line: 23 }],
  endpoints_affected: ["GET /x"],
  crons_affected: ["nightly"],
};

describe("SymbolGroup", () => {
  it("links to the pinned commit, toggles, and keeps crons apart from endpoints", () => {
    renderGroup(one);
    const link = screen.getByRole("link", { name: "src/a.ts:23" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/w/blob/idx1/src/a.ts#L23");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("1 caller")).toBeInTheDocument();
    expect(link.closest("div")).toHaveAttribute("title", "intentRoutes");
    expect(screen.queryByText("intentRoutes")).not.toBeInTheDocument();

    const endpoints = screen.getByTestId("endpoint-chips");
    const crons = screen.getByTestId("cron-chips");
    expect(endpoints).not.toBe(crons);
    expect(within(endpoints).getByText("GET /x")).toBeInTheDocument();
    expect(within(crons).getByText("nightly")).toBeInTheDocument();

    const header = screen.getByRole("button", { name: /getContext\(\)/ });
    expect(header.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("zero-caller row is static; cap hint only at the cap; plural", () => {
    renderGroup({ symbol: "Lonely", callers: [], endpoints_affected: [], crons_affected: [] });
    expect(screen.getByText("no callers")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    cleanup();

    const two = {
      ...one,
      callers: [
        { name: "a", file: "a.ts", line: 1 },
        { name: "b", file: "b.ts", line: 2 },
      ],
    };
    renderGroup(two, 5);
    expect(screen.getByText("2 callers")).toBeInTheDocument();
    expect(screen.queryByText(/Top 5 callers/)).not.toBeInTheDocument();
    cleanup();
    renderGroup(two, 2);
    expect(screen.getByText("Top 2 callers by rank")).toBeInTheDocument();
  });

  it("caps chips at 6 and reveals the rest on '+N more'", () => {
    const endpoints = Array.from({ length: 8 }, (_, i) => `GET /e${i}`);
    renderGroup({ ...one, endpoints_affected: endpoints, crons_affected: [] });
    const chips = screen.getByTestId("endpoint-chips");
    expect(within(chips).getAllByText(/GET \/e/)).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(within(screen.getByTestId("endpoint-chips")).getAllByText(/GET \/e/)).toHaveLength(8);
  });
});
