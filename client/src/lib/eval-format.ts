import type { EvalConfigSnapshot, EvalRunSummary } from "@devdigest/shared";

const DASH = "—";
const MINUS = "−";

/** A run that produced metrics (`done` or `partial`). */
export function isFinished(run: Pick<EvalRunSummary, "status">): boolean {
  return run.status === "done" || run.status === "partial";
}

/** Whole-number percentage; `null` (denominator 0) renders as "—". */
export function formatPct(v: number | null | undefined): string {
  return v == null ? DASH : `${Math.round(v * 100)}%`;
}

/** Whole-point change vs the previous run, sign written as text: "▲ 4 pt" / "▼ 4 pt" / "± 0 pt". */
export function formatDelta(cur: number | null | undefined, prev: number | null | undefined): string | null {
  if (cur == null || prev == null) return null;
  const pts = Math.round((cur - prev) * 100);
  if (pts === 0) return "± 0 pt";
  return pts > 0 ? `▲ ${pts} pt` : `▼ ${Math.abs(pts)} pt`;
}

/** USD cost; `null` (unknown) renders as "—", never "$0.00". */
export function formatCost(v: number | null | undefined): string {
  if (v == null) return DASH;
  return v > 0 && v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

/** Signed USD change for the compare view; "—" when either cost is unknown. */
export function formatCostDelta(a: number | null | undefined, b: number | null | undefined): string | null {
  if (a == null || b == null) return null;
  const diff = b - a;
  if (Math.abs(diff) < 0.00005) return "± $0";
  const abs = formatCost(Math.abs(diff));
  return diff > 0 ? `+${abs}` : `${MINUS}${abs}`;
}

/** "<passed>/<scored>" from a run's counts; "—" while there are none. */
export function passText(run: Pick<EvalRunSummary, "counts">): string {
  return run.counts ? `${run.counts.cases_passed}/${run.counts.cases_scored}` : DASH;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export interface DiffLine {
  op: "+" | "−" | " ";
  text: string;
}

/** Above this many LCS cells the diff degrades to remove-all / add-all (keeps the UI responsive). */
const MAX_LCS_CELLS = 4_000_000;

/** Line diff of two texts (LCS on lines). `a` is the older text. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  if (x.length * y.length > MAX_LCS_CELLS) {
    return [...x.map((text): DiffLine => ({ op: "−", text })), ...y.map((text): DiffLine => ({ op: "+", text }))];
  }
  const w = y.length + 1;
  const lcs = new Uint32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        x[i] === y[j]
          ? (lcs[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * w + j] ?? 0, lcs[i * w + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ op: " ", text: x[i] as string });
      i++;
      j++;
    } else if ((lcs[(i + 1) * w + j] ?? 0) >= (lcs[i * w + j + 1] ?? 0)) {
      out.push({ op: "−", text: x[i] as string });
      i++;
    } else {
      out.push({ op: "+", text: y[j] as string });
      j++;
    }
  }
  for (; i < x.length; i++) out.push({ op: "−", text: x[i] as string });
  for (; j < y.length; j++) out.push({ op: "+", text: y[j] as string });
  return out;
}

export type ConfigChange =
  | { kind: "model"; from: string; to: string }
  | { kind: "strategy"; from: string; to: string }
  | { kind: "skill_added"; name: string }
  | { kind: "skill_removed"; name: string }
  | { kind: "skill_version"; name: string; from: number; to: number };

const modelLabel = (c: EvalConfigSnapshot) => `${c.provider}/${c.model}`;

/** Model / strategy / skill differences between two snapshots (`a` older). */
export function configDiff(a: EvalConfigSnapshot, b: EvalConfigSnapshot): ConfigChange[] {
  const out: ConfigChange[] = [];
  if (modelLabel(a) !== modelLabel(b)) out.push({ kind: "model", from: modelLabel(a), to: modelLabel(b) });
  if (a.strategy !== b.strategy) out.push({ kind: "strategy", from: a.strategy, to: b.strategy });
  const before = new Map(a.skills.map((sk) => [sk.skill_id, sk]));
  const after = new Map(b.skills.map((sk) => [sk.skill_id, sk]));
  for (const sk of b.skills) {
    const old = before.get(sk.skill_id);
    if (!old) out.push({ kind: "skill_added", name: sk.name });
    else if (old.version !== sk.version) out.push({ kind: "skill_version", name: sk.name, from: old.version, to: sk.version });
  }
  for (const sk of a.skills) if (!after.has(sk.skill_id)) out.push({ kind: "skill_removed", name: sk.name });
  return out;
}

/** Cases present only in `b` (added) / only in `a` (removed). */
export function caseSetDiff(a: readonly string[], b: readonly string[]): { added: number; removed: number } {
  const sa = new Set(a);
  const sb = new Set(b);
  return { added: [...sb].filter((id) => !sa.has(id)).length, removed: [...sa].filter((id) => !sb.has(id)).length };
}

/** Same `agent_version` as the previous run but a different `config_id` (e.g. a skills-only change). */
export function configChanged(
  run: Pick<EvalRunSummary, "config">,
  prev: Pick<EvalRunSummary, "config"> | undefined,
): boolean {
  return !!prev && run.config.agent_version === prev.config.agent_version && run.config.config_id !== prev.config.config_id;
}
