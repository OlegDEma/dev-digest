#!/usr/bin/env node
// pr-gate-check.mjs — the local stamp validator + writer. Reviews nothing; it
// answers, in milliseconds, "is there a fresh passing review for this tree?"
//
//   node pr-gate-check.mjs                 validate the current branch's stamp
//   node pr-gate-check.mjs --write <verdict> [--mode m] [--base b]
//        [--counts '{"critical":0,...}'] [--waivers id,id]   (called by the skill)
//
// Validate exit codes:  0 PASS · 1 BLOCKED · 3 STALE · 4 MISSING
// The validator judges by the stamp's OWN mode, so flipping mode in routing.md
// never retroactively re-judges a review that already ran.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  repoRoot, branchName, stampPathFor, currentTree, readConfig, SKILL_VERSION,
} from "./gate-lib.mjs";

const root = repoRoot();
const branch = branchName(root);
const stampPath = stampPathFor(branch, root);
const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

if (args[0] === "--write") {
  const verdict = args[1]; // pass | warn | block
  if (!["pass", "warn", "block"].includes(verdict)) {
    console.error("usage: pr-gate-check.mjs --write <pass|warn|block> [flags]");
    process.exit(2);
  }
  const cfg = readConfig(root);
  let counts = {};
  try { counts = JSON.parse(flag("--counts", "{}")); } catch { /* leave empty */ }
  const stamp = {
    skill: "pr-self-review",
    version: SKILL_VERSION,
    base: flag("--base", cfg.base),
    ...currentTree(root),
    mode: flag("--mode", cfg.mode),
    verdict,
    counts,
    waivers: (flag("--waivers", "") || "").split(",").filter(Boolean),
    generated_at: new Date().toISOString(),
  };
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + "\n");
  console.log(`stamp written → ${stampPath}  (${stamp.mode}, verdict=${verdict})`);
  process.exit(0);
}

if (!existsSync(stampPath)) {
  console.log(`MISSING — no review stamp for branch '${branch}'. Run /pr-self-review.`);
  process.exit(4);
}
const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
const now = currentTree(root);
if (stamp.head !== now.head || stamp.worktree !== now.worktree) {
  const s = (x) => String(x).slice(0, 7);
  console.log(
    `STALE — tree changed since the review ` +
    `(stamp ${s(stamp.head)}/${s(stamp.worktree)} → now ${s(now.head)}/${s(now.worktree)}). ` +
    `Re-run /pr-self-review.`,
  );
  process.exit(3);
}
if (stamp.mode === "blocking" && stamp.verdict === "block") {
  console.log("BLOCKED — the last review found confirmed CRITICAL(s) under blocking mode. Not clear to open a PR.");
  process.exit(1);
}
console.log(`PASS — fresh ${stamp.mode} review (verdict=${stamp.verdict}) for '${branch}'.`);
process.exit(0);
