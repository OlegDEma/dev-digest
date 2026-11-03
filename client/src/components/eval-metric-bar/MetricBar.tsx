/* MetricBar — a 0..1 metric as a coloured bar plus its value as text ("—" and no
   bar when unknown). Colour bands come from metricBand; the text carries the value
   so colour is never the only signal. */
import React from "react";
import { ProgressBar } from "@devdigest/ui";
import { BAND_COLOR, formatPct, metricBand } from "@/lib/eval-format";
import { s } from "./styles";

export function MetricBar({ value }: { value: number | null | undefined }) {
  return (
    <div style={s.wrap}>
      <div style={s.bar}>{value != null && <ProgressBar value={value * 100} color={BAND_COLOR[metricBand(value)]} />}</div>
      <span className="tnum" style={s.text}>
        {formatPct(value)}
      </span>
    </div>
  );
}
