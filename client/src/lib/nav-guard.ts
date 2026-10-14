/* nav-guard.ts — a single module-level "leave guard" for programmatic
   navigation. A page with unsaved work registers a guard; every shell path
   that calls `router.push` (command palette, repo switcher, g-key shortcuts)
   goes through `guardedNavigate`, so a dirty editor can ask first. Link clicks,
   beforeunload and Back/Forward are handled by the page's own listeners. */

/** Returns true when it took over the navigation; it must call `proceed` once the user confirms. */
export type NavGuard = (proceed: () => void) => boolean;

let guard: NavGuard | null = null;

/** Registers the active guard; returns the unregister function. */
export function registerNavGuard(g: NavGuard): () => void {
  guard = g;
  return () => {
    if (guard === g) guard = null;
  };
}

/** Runs `go` now, or hands it to the registered guard to run after confirmation. */
export function guardedNavigate(go: () => void): void {
  if (guard && guard(go)) return;
  go();
}
