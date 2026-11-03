export interface ChartPad {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** SVG path strings for a 0..1 series; a null value ends the current segment (a gap). A lone point is drawn as a dot-length segment. */
export function buildSegments(values: (number | null)[], w: number, h: number, pad: ChartPad): string[] {
  const n = values.length;
  const x = (i: number) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - Math.max(0, Math.min(1, v))) * (h - pad.t - pad.b);
  const out: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length === 1) cur.push(cur[0]!.replace("M", "L"));
    if (cur.length) out.push(cur.join(" "));
    cur = [];
  };
  values.forEach((v, i) => {
    if (v == null) return flush();
    cur.push(`${cur.length ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  flush();
  return out;
}
