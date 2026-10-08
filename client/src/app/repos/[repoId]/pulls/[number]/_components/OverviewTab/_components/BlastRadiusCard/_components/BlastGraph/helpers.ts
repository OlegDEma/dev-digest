import type { BlastCaller, DownstreamImpact, PrBlastResponse } from "@devdigest/shared";
import { CHAR_W, COL_GAP, DEFAULT_WIDTH, MIN_WIDTH, NODE_H, PAD, ROW_GAP, type NodeKind } from "./styles";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** Middle-ellipsized text drawn in the node. */
  label: string;
  /** Untruncated text for the SVG <title>. */
  full: string;
  col: 0 | 1 | 2;
  /** Node width: one third of the container, minus gaps. */
  w: number;
  x: number;
  y: number;
  /** Caller nodes only: link target. */
  file?: string;
  line?: number;
  name?: string;
  /** "more" nodes only: how many facts they stand for. */
  count?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  hasFacts: boolean;
}

export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

const basename = (p: string) => p.split("/").pop() ?? p;
const ROW = NODE_H + ROW_GAP;

/** Push nodes of one column down so no two are closer than one row. */
function deoverlap(nodes: GraphNode[]) {
  const sorted = [...nodes].sort((a, b) => a.y - b.y);
  let floor = PAD;
  for (const n of sorted) {
    n.y = Math.max(n.y, floor);
    floor = n.y + ROW;
  }
}

/** Function name when the index knows it; `basename:line` when the name is empty or just the file's own name. */
export function callerLabel(c: BlastCaller): string {
  const base = basename(c.file);
  return c.name && c.name !== base ? c.name : `${base}:${c.line}`;
}

/** Cubic Bézier from the right edge of `a` to the left edge of `b`. */
export function bezier(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.w;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const dx = (x2 - x1) / 2;
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/**
 * Focus mode, three columns for ONE changed symbol: symbol -> caller -> endpoint/cron. Caller -> fact
 * edges come only from that caller file's own facts, so nothing is attributed to a file that does not declare it.
 */
export function layoutGraph(
  group: DownstreamImpact,
  factsByFile: PrBlastResponse["facts_by_file"],
  { cap, maxFactNodes, width = DEFAULT_WIDTH }: { cap: number; maxFactNodes: number; width?: number },
): GraphLayout {
  const total = Math.max(width, MIN_WIDTH);
  const nodeW = Math.floor((total - PAD * 2 - COL_GAP * 2) / 3);
  const colX = (col: number) => PAD + col * (nodeW + COL_GAP);
  const maxChars = Math.max(8, Math.floor((nodeW - 16) / CHAR_W));
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (from: string, to: string) => {
    const k = `${from}->${to}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ from, to });
  };

  const symId = `s:${group.symbol}`;
  const symbol: GraphNode = {
    id: symId,
    kind: "symbol",
    label: truncateMiddle(`${group.symbol}()`, maxChars),
    full: `${group.symbol}()`,
    col: 0,
    w: nodeW,
    x: colX(0),
    y: PAD,
  };
  nodes.set(symId, symbol);

  const callerNodes: GraphNode[] = [];
  for (const c of group.callers.slice(0, cap)) {
    const cid = `c:${c.file}:${c.line}`;
    if (!nodes.has(cid)) {
      const node: GraphNode = {
        id: cid,
        kind: "caller",
        label: truncateMiddle(callerLabel(c), maxChars),
        full: `${c.file}:${c.line} ${c.name}`,
        col: 1,
        w: nodeW,
        x: colX(1),
        y: PAD + callerNodes.length * ROW,
        file: c.file,
        line: c.line,
        name: c.name,
      };
      nodes.set(cid, node);
      callerNodes.push(node);
    }
    addEdge(symId, cid);
  }
  symbol.y = callerNodes.length ? Math.max(PAD, callerNodes.reduce((sum, n) => sum + n.y, 0) / callerNodes.length) : PAD;

  const barycenter = (ids: string[]) => ids.reduce((sum, id) => sum + nodes.get(id)!.y, 0) / ids.length;

  // Facts, deduped by text, endpoints before crons per caller; overflow collapses into one node.
  const factKind = new Map<string, "endpoint" | "cron">();
  const factSources = new Map<string, string[]>();
  for (const c of callerNodes) {
    const facts = factsByFile[c.file!] ?? { endpoints: [], crons: [] };
    const add = (text: string, kind: "endpoint" | "cron") => {
      const key = `${kind}:${text}`;
      factKind.set(key, kind);
      factSources.set(key, [...(factSources.get(key) ?? []), c.id]);
    };
    facts.endpoints.forEach((e) => add(e, "endpoint"));
    facts.crons.forEach((e) => add(e, "cron"));
  }
  const keys = [...factKind.keys()];
  const shown = keys.slice(0, maxFactNodes);
  const hidden = keys.slice(maxFactNodes);
  const factNodes: GraphNode[] = [];
  for (const key of shown) {
    const kind = factKind.get(key)!;
    const text = key.slice(kind.length + 1);
    const node: GraphNode = {
      id: `f:${key}`,
      kind,
      label: truncateMiddle(text, maxChars),
      full: text,
      col: 2,
      w: nodeW,
      x: colX(2),
      y: barycenter(factSources.get(key)!),
    };
    nodes.set(node.id, node);
    factNodes.push(node);
    for (const src of factSources.get(key)!) addEdge(src, node.id);
  }
  if (hidden.length > 0) {
    const srcs = [...new Set(hidden.flatMap((k) => factSources.get(k)!))];
    const more: GraphNode = {
      id: "f:more",
      kind: "more",
      label: "",
      full: "",
      col: 2,
      w: nodeW,
      x: colX(2),
      y: barycenter(srcs),
      count: hidden.length,
    };
    nodes.set(more.id, more);
    factNodes.push(more);
    for (const src of srcs) addEdge(src, more.id);
  }
  deoverlap(factNodes);

  const all = [...nodes.values()];
  const hasFacts = factNodes.length > 0;
  const maxY = all.reduce((m, n) => Math.max(m, n.y), 0);
  return {
    nodes: all,
    edges,
    width: total,
    height: maxY + NODE_H + PAD,
    hasFacts,
  };
}
