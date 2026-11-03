import { EvalDashboard } from "./_components/EvalDashboard";

/* Route: /eval (Eval Dashboard). Thin route entry — the view, its agent cards and
   recent-runs table live under _components/EvalDashboard. */
export default function EvalPage() {
  return <EvalDashboard />;
}
