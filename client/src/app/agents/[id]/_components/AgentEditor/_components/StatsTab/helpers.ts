/** A 0..1 ratio as a whole percent number; `null` (no denominator) stays `null`. */
export function percentValue(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100);
}

/** Mean latency as "850 ms" / "2.4 s"; `null` (unknown) stays `null`. */
export function latencyText(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
