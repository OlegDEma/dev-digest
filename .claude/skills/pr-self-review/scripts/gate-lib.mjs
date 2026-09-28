// gate-lib.mjs — the one place the stamp contract lives, so the local check, the
// CI check, and the skill's stamp-writer can never drift. A stamp answers one
// question: "was there a passing pr-self-review for EXACTLY this tree?"
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SKILL_VERSION = "1.0.0";

export const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim();

export function repoRoot() {
  return sh("git rev-parse --show-toplevel");
}

export function branchName(root = repoRoot()) {
  return sh("git rev-parse --abbrev-ref HEAD", { cwd: root });
}

export function stampPathFor(branch, root = repoRoot()) {
  return join(root, ".claude", "reviews", `${branch.replace(/[^\w.-]/g, "__")}.stamp.json`);
}

// Canonical config lives in routing.md (a fenced ```json block), so the mode and
// base a human reads are the same values the scripts enforce — no second source.
export function readConfig(root = repoRoot()) {
  const p = join(root, ".claude", "skills", "pr-self-review", "routing.md");
  let cfg = {};
  try {
    const m = readFileSync(p, "utf8").match(/```json\s*([\s\S]*?)```/);
    if (m) cfg = JSON.parse(m[1]);
  } catch {
    /* fall back to defaults below */
  }
  return { mode: "report-only", base: "main", caps: {}, ...cfg };
}

// The tree fingerprint. HEAD pins the commit; `worktree` folds in uncommitted
// changes so any edit after a review makes the stamp STALE. "clean" == nothing
// uncommitted, which is the only state CI can reproduce from a checkout.
export function worktreeHash(root = repoRoot()) {
  // The review artifacts under .claude/reviews/ are excluded — otherwise writing
  // the stamp would mutate the tree and instantly invalidate its own freshness.
  let diff = "";
  try {
    diff = sh("git diff HEAD -- . ':!.claude/reviews'", { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  } catch { /* no HEAD yet */ }
  const others = sh("git ls-files --others --exclude-standard", { cwd: root })
    .split("\n")
    .filter((f) => f && !f.startsWith(".claude/reviews/"));
  if (!diff && others.length === 0) return "clean";
  const h = createHash("sha256").update(diff);
  for (const f of others) {
    h.update("\0" + f + "\0");
    try { h.update(readFileSync(join(root, f))); } catch { /* vanished/binary — name still counts */ }
  }
  return h.digest("hex");
}

export function currentTree(root = repoRoot()) {
  return { head: sh("git rev-parse HEAD", { cwd: root }), worktree: worktreeHash(root) };
}
