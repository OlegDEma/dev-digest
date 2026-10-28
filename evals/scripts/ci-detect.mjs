/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   CLAUDE.md / AGENTS.md (root or per-package) / .claude/settings.json / any agent /
 *   engine, deps or proxy change                         → run the workflow tier
 *
 * EVAL_SCOPE=all (manual workflow_dispatch) ignores the diff and runs every suite that has evals.
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const SCOPE_ALL = process.env.EVAL_SCOPE === "all";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** Every evals/<tier>/<name>/ directory — the scope=all universe. */
function allSuites(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

const skillNames = SCOPE_ALL
  ? allSuites("skills")
  : touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
const agentNames = SCOPE_ALL
  ? allSuites("agents")
  : touched(/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// any CLAUDE.md / AGENTS.md (CLAUDE.md is a one-line `@AGENTS.md` import here, so the real
// content lives in AGENTS.md), project settings, any agent definition, the workflow cases, or the
// engine itself (src, deps, proxy, the CI workflow).
const runWorkflow =
  SCOPE_ALL ||
  changed.some(
    (f) =>
      /(^|\/)(CLAUDE|AGENTS)\.md$/.test(f) ||
      f === ".claude/settings.json" ||
      /^\.claude\/agents\/.+\.md$/.test(f) ||
      /^evals\/(workflow|src|proxy)\//.test(f) ||
      /^evals\/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vitest\.config\.ts)$/.test(f) ||
      f === ".github/workflows/evals.yml",
  );

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`scope         : ${SCOPE_ALL ? "all" : "changed"}`);
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
// One SKIP line per artifact, as a ::notice:: annotation on Actions so it is visible without
// failing anything.
const skip = (kind, name) => {
  const msg = `SKIP ${kind} ${name}: no evals/${kind}s/${name}/*.eval.ts`;
  console.error(msg);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=evals skipped::${msg}`);
};
skippedSkills.forEach((n) => skip("skill", n));
skippedAgents.forEach((n) => skip("agent", n));
