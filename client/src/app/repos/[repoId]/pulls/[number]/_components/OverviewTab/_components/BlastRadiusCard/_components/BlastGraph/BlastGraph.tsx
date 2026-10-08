/* BlastGraph — dependency-free SVG view: changed symbol -> caller -> endpoint/cron.
   The Tree view is the accessible alternative; the graph is supplementary. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact, PrBlastResponse } from "@devdigest/shared";
import { bezier, layoutGraph, type GraphNode } from "./helpers";
import { DEFAULT_WIDTH, MAX_FACT_NODES, NODE_H, s, type NodeKind } from "./styles";

interface BlastGraphProps {
  downstream: DownstreamImpact[];
  factsByFile: PrBlastResponse["facts_by_file"];
  cap: number;
  hrefFor: (file: string, line: number) => string | null;
}

const LEGEND: NodeKind[] = ["symbol", "caller", "endpoint", "cron"];

export function BlastGraph({ downstream, factsByFile, cap, hrefFor }: BlastGraphProps) {
  const t = useTranslations("blast");
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const activeId = hoverId ?? focusedId;
  // Lay out at the container's real width so the svg renders 1:1 (readable text, no scrollbar).
  const hasGroup = downstream.some((g) => g.callers.length > 0);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(Math.floor(el.clientWidth) || DEFAULT_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasGroup]);  const withCallers = React.useMemo(() => downstream.filter((g) => g.callers.length > 0), [downstream]);
  const [symbol, setSymbol] = React.useState<string | undefined>(withCallers[0]?.symbol);
  const group = withCallers.find((g) => g.symbol === symbol) ?? withCallers[0];
  const layout = React.useMemo(
    () => (group ? layoutGraph(group, factsByFile, { cap, maxFactNodes: MAX_FACT_NODES, width }) : null),
    [group, factsByFile, cap, width],
  );

  if (!group || !layout) return <span style={s.muted}>{t("graph.empty")}</span>;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  const body = (n: GraphNode) => {
    const text = n.kind === "more" ? t("graph.more", { count: n.count ?? 0 }) : n.label;
    return (
      <>
        <title>{n.kind === "more" ? text : n.full}</title>
        <rect x={n.x} y={n.y} width={n.w} height={NODE_H} rx={5} style={s.rect(n.kind, focusedId === n.id)} />
        <text className="mono" x={n.x + 8} y={n.y + NODE_H / 2 + 4} style={s.text(n.kind)}>
          {text}
        </text>
      </>
    );
  };

  return (
    <div>
      <select aria-label={t("graph.symbolSelect")} value={group.symbol} onChange={(e) => setSymbol(e.target.value)} style={s.select}>
        {withCallers.map((g) => (
          <option key={g.symbol} value={g.symbol}>
            {g.symbol}()
          </option>
        ))}
      </select>
      <div ref={hostRef} style={s.scroll}>
        <svg
          role="group"
          aria-label={t("graph.ariaLabel")}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={s.svg}
        >
          {layout.edges.map((e) => {
            const a = byId.get(e.from)!;
            const b = byId.get(e.to)!;
            return (
              <path key={`${e.from}->${e.to}`} d={bezier(a, b)} fill="none" style={s.edge(e.from === activeId || e.to === activeId)} />
            );
          })}
          {layout.nodes.map((n) => {
            if (n.kind !== "caller") {
              return (
                <g key={n.id} onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)}>
                  {body(n)}
                </g>
              );
            }
            const href = hrefFor(n.file!, n.line!) ?? undefined;
            return (
              <a
                key={n.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${n.file}:${n.line} ${n.name}`}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setFocusedId(n.id)}
                onBlur={() => setFocusedId((cur) => (cur === n.id ? null : cur))}
              >
                {body(n)}
              </a>
            );
          })}
        </svg>
      </div>
      {!layout.hasFacts && <div style={s.muted}>{t("graph.noEndpoints")}</div>}
      <div style={s.legend}>
        {LEGEND.map((k) => (
          <span key={k} style={s.legendItem}>
            <span style={s.swatch(k)} />
            {t(`graph.legend.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
