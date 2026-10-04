import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role presentation. Record<SmartDiffRole,…> makes tsc fail if the enum grows without UI. */
export const ROLE_UI: Record<
  SmartDiffRole,
  { labelKey: string; descriptionKey: string; color: string; defaultOpen: boolean }
> = {
  core: {
    labelKey: "smartDiff.coreLabel",
    descriptionKey: "smartDiff.coreDescription",
    color: "var(--accent)",
    defaultOpen: false,
  },
  tests: {
    labelKey: "smartDiff.testsLabel",
    descriptionKey: "smartDiff.testsDescription",
    color: "var(--ok)",
    defaultOpen: false,
  },
  wiring: {
    labelKey: "smartDiff.wiringLabel",
    descriptionKey: "smartDiff.wiringDescription",
    color: "var(--warn)",
    defaultOpen: false,
  },
  docs: {
    labelKey: "smartDiff.docsLabel",
    descriptionKey: "smartDiff.docsDescription",
    color: "var(--info)",
    defaultOpen: false,
  },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    descriptionKey: "smartDiff.boilerplateDescription",
    color: "var(--text-muted)",
    defaultOpen: false,
  },
};

/**
 * Reading order of the groups — mirrors `SmartDiffRole` declaration order. Type-only import:
 * Next can't bundle value imports from the vendored `@devdigest/shared` barrel (`./contracts/*.js`).
 * `satisfies` + `RoleOrderCovers` make tsc fail if the enum grows and this list doesn't.
 */
export const ROLE_ORDER = ["core", "tests", "wiring", "docs", "boilerplate"] as const satisfies readonly SmartDiffRole[];
type RoleOrderCovers = Exclude<SmartDiffRole, (typeof ROLE_ORDER)[number]> extends never ? true : false;
const roleOrderCovers: RoleOrderCovers = true;
void roleOrderCovers;
