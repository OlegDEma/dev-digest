/* Test fixtures for the per-agent eval dashboard, batch runs and Promote (not shipped to the UI). */
import type { AgentEvalDashboard, EvalSeriesPoint } from "@devdigest/shared";
import { makeRun } from "./eval-fixtures";

export function makePoint(over: Partial<EvalSeriesPoint> = {}): EvalSeriesPoint {
  return {
    run_id: "run1",
    ran_at: "2026-10-01T10:00:00.000Z",
    agent_version: 1,
    recall: 0.6,
    precision: 0.8,
    citation_accuracy: 0.9,
    ...over,
  };
}

export function makeAgentDashboard(over: Partial<AgentEvalDashboard> = {}): AgentEvalDashboard {
  const latest = makeRun({ id: "run2", started_at: "2026-10-02T10:00:00.000Z" });
  const previous = makeRun({
    id: "run1",
    metrics: { ...latest.metrics!, recall: 0.7, precision: 0.8, citation_accuracy: 0.9 },
  });
  return {
    agent: { id: "ag1", name: "Security Reviewer", model: "gpt-4.1" },
    range: "30d",
    latest,
    previous,
    series: [makePoint({ run_id: "run1", recall: 0.7 }), makePoint({ run_id: "run2", recall: 0.66, ran_at: "2026-10-02T10:00:00.000Z" })],
    runs: [latest, previous],
    regression: null,
    ...over,
  };
}
