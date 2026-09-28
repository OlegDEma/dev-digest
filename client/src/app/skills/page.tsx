import { SkillsLanding } from "./_components/SkillsLanding";

/* Route: /skills. Thin route entry — the landing opens the first skill in the
   editor (or shows the empty state); the rail, modals and editor live under
   _components/. */
export default function SkillsPage() {
  return <SkillsLanding />;
}
