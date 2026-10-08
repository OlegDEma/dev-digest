import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";
import { bezier, callerLabel, layoutGraph, truncateMiddle } from "./helpers";

afterEach(cleanup);

const hrefFor = (file: string, line: number) => `https://github.com/acme/w/blob/idx1/${file}#L${line}`;

function fixture(n: number, factsPer: (i: number) => { endpoints: string[]; crons: string[] }) {
  const callers = Array.from({ length: n }, (_, i) => ({ name: `fn${i}`, file: `src/f${i}.ts`, line: i + 1 }));
  const downstream: DownstreamImpact[] = [{ symbol: "sym", callers, endpoints_affected: [], crons_affected: [] }];
  const facts = Object.fromEntries(callers.map((c, i) => [c.file, factsPer(i)]));
  return { downstream, facts };
}

describe("layoutGraph", () => {
  it("draws caller -> fact edges only from each file's own facts", () => {
    const f = fixture(11, (i) => ({
      endpoints: Array.from({ length: 2 + (i % 3) }, (_, k) => `GET /f${i}/e${k}`),
      crons: i % 2 ? [`cron-${i}`] : [],
    }));
    const total = Object.values(f.facts).reduce((n, x) => n + x.endpoints.length + x.crons.length, 0);
    const l = layoutGraph(f.downstream[0]!, f.facts, { cap: 50, maxFactNodes: 1000 });
    const symbolEdges = l.edges.filter((e) => e.from.startsWith("s:"));
    expect(symbolEdges).toHaveLength(11);
    expect(l.edges.length - symbolEdges.length).toBe(total);
  });

  it("collapses facts beyond the node limit into one +N more node", () => {
    const f = fixture(1, () => ({ endpoints: Array.from({ length: 40 }, (_, k) => `GET /e${k}`), crons: [] }));
    const l = layoutGraph(f.downstream[0]!, f.facts, { cap: 50, maxFactNodes: 30 });
    expect(l.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(30);
    const more = l.nodes.filter((n) => n.kind === "more");
    expect(more).toHaveLength(1);
    expect(more[0]!.count).toBe(10);
  });

  it("two columns when there are no facts", () => {
    const f = fixture(2, () => ({ endpoints: [], crons: [] }));
    const l = layoutGraph(f.downstream[0]!, f.facts, { cap: 50, maxFactNodes: 30 });
    expect(l.hasFacts).toBe(false);
    expect(new Set(l.nodes.map((n) => n.col))).toEqual(new Set([0, 1]));
  });

  it("labels callers by function name, falling back to basename:line", () => {
    expect(callerLabel({ name: "intentRoutes", file: "src/a/routes.ts", line: 9 })).toBe("intentRoutes");
    expect(callerLabel({ name: "", file: "src/a/routes.ts", line: 9 })).toBe("routes.ts:9");
    expect(callerLabel({ name: "routes.ts", file: "src/a/routes.ts", line: 9 })).toBe("routes.ts:9");
  });

  it("draws cubic Bézier edges", () => {
    const f = fixture(1, () => ({ endpoints: ["GET /x"], crons: [] }));
    const l = layoutGraph(f.downstream[0]!, f.facts, { cap: 50, maxFactNodes: 30 });
    const [a, b] = l.nodes;
    expect(bezier(a!, b!)).toMatch(/^M [\d.]+,[\d.]+ C /);
  });

  it("ellipsizes the middle of long labels", () => {
    const long = "src/modules/some/very/long/path/file.ts";
    const out = truncateMiddle(long, 28);
    expect(out).toHaveLength(28);
    expect(out).toContain("…");
  });
});

function renderGraph(downstream: DownstreamImpact[], facts: Record<string, { endpoints: string[]; crons: string[] }>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph downstream={downstream} factsByFile={facts} cap={50} hrefFor={hrefFor} />
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("renders an accessible group, caller links with focus ring, title text and legend", () => {
    const f = fixture(2, () => ({ endpoints: ["GET /x"], crons: ["nightly"] }));
    renderGraph(f.downstream, f.facts);
    expect(screen.getByRole("group", { name: "Blast radius graph" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/f0.ts:1 fn0" });
    expect(link).toHaveTextContent("fn0");
    expect(link).toHaveAttribute("href", "https://github.com/acme/w/blob/idx1/src/f0.ts#L1");
    expect(link).toHaveAttribute("target", "_blank");
    const rect = link.querySelector("rect")!;
    expect(rect.style.strokeWidth).toBe("1");
    fireEvent.focus(link);
    expect(rect.style.strokeWidth).toBe("3");
    fireEvent.blur(link);
    expect(rect.style.strokeWidth).toBe("1");
    expect(link.querySelector("title")!.textContent).toBe("src/f0.ts:1 fn0");
    for (const l of ["changed symbol", "caller", "endpoint", "cron / job"]) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it("graphs one symbol at a time: the selector defaults to the first and re-graphs on change", () => {
    const a = fixture(1, () => ({ endpoints: [], crons: [] }));
    const b = fixture(1, () => ({ endpoints: [], crons: [] }));
    const second = { ...b.downstream[0]!, symbol: "other", callers: [{ name: "otherFn", file: "src/o.ts", line: 4 }] };
    renderGraph([a.downstream[0]!, second], { ...a.facts, ...b.facts });
    const select = screen.getByRole("combobox", { name: "Symbol to graph" }) as HTMLSelectElement;
    expect(select.value).toBe("sym");
    expect(screen.queryByRole("link", { name: /otherFn/ })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "other" } });
    expect(screen.getByRole("link", { name: "src/o.ts:4 otherFn" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /fn0/ })).not.toBeInTheDocument();
  });

  it("says so when there are no callers or no endpoints", () => {
    renderGraph([{ symbol: "x", callers: [], endpoints_affected: [], crons_affected: [] }], {});
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    cleanup();
    const f = fixture(1, () => ({ endpoints: [], crons: [] }));
    renderGraph(f.downstream, f.facts);
    expect(screen.getByText("No endpoints or cron jobs in the caller files.")).toBeInTheDocument();
  });
});
