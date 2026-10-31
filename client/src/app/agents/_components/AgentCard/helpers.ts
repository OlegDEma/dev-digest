import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** A 0..1 ratio as a whole percent ("85%"); `null` (no denominator) → `unknown`. */
export function percentText(rate: number | null | undefined, unknown: string): string {
  return rate == null ? unknown : `${Math.round(rate * 100)}%`;
}
