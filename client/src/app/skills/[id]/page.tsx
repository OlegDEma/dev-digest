import { SkillEditorRoute } from "../_components/SkillEditorRoute";

/* Route: /skills/:id?tab=config|preview|evals|stats|versions. Thin route entry —
   the rail + tabbed editor live under ../_components/. */
export default function SkillEditorPage() {
  return <SkillEditorRoute />;
}
