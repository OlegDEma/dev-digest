import type { EvalMetricName, EvalRegression } from "@devdigest/shared";

type T = (key: string, values?: Record<string, string | number>) => string;

const METRICS: EvalMetricName[] = ["recall", "precision", "citation_accuracy"];

/** Banner text from the server's deltas (AC-D83): dips, new false positive, missed findings, then the other metrics' direction. */
export function composeBanner(r: EvalRegression, t: T): string {
  const name = (m: EvalMetricName, first: boolean) => {
    const n = t(`regression.metric.${m}`);
    return first ? n : n.charAt(0).toLowerCase() + n.slice(1);
  };
  const dropped = new Set(r.drops.map((d) => d.metric));
  const list = (ms: EvalMetricName[]) =>
    ms.length === 2 ? t("regression.pair", { a: name(ms[0]!, true), b: name(ms[1]!, false) }) : ms.length === 1 ? name(ms[0]!, true) : "";

  let out = r.drops
    .map((d) => t("regression.dip", { metric: name(d.metric, true), points: Math.abs(d.points), version: r.agent_version }))
    .join(", ");
  if (r.forbidden_hits_delta > 0) out += t("regression.falsePositive");
  if (r.fn_delta > 0) out += t("regression.missed", { count: r.fn_delta });
  out += ".";

  const others = METRICS.filter((m) => !dropped.has(m));
  const up = others.filter((m) => r.rises.some((x) => x.metric === m && x.points > 0));
  const same = others.filter((m) => !up.includes(m));
  if (up.length) out += " " + t("regression.up", { count: up.length, metrics: list(up) });
  if (same.length) out += " " + t("regression.unchanged", { metrics: list(same) });
  return out;
}
