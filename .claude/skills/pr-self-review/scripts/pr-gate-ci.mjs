#!/usr/bin/env node
// pr-gate-ci.mjs — the CI half, because a local hook cannot hold GitHub's Merge
// button. No LLM, no secrets, `contents: read`. It verifies that a COMMITTED
// stamp matches this PR's head commit and passed — the honour-based local run,
// made enforceable. It re-reviews nothing.
//
// Policy comes from routing.md `mode`:
//   report-only → annotate, always green (exit 0)
//   blocking    → a missing/stale/failed stamp fails the check (exit 1)
import { existsSync, readFileSync } from "node:fs";
import { repoRoot, stampPathFor, readConfig, sh } from "./gate-lib.mjs";

const root = repoRoot();
const cfg = readConfig(root);
// On a pull_request event GITHUB_SHA is the merge commit; the workflow passes the
// real PR head via PR_HEAD_SHA / PR_HEAD_REF.
const headSha = process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || sh("git rev-parse HEAD", { cwd: root });
const branch = process.env.PR_HEAD_REF || sh("git rev-parse --abbrev-ref HEAD", { cwd: root });
const stampPath = stampPathFor(branch, root);

const blocking = cfg.mode === "blocking";
const fail = (msg) => {
  console.log(`::${blocking ? "error" : "warning"}::pr-gate (${cfg.mode}): ${msg}`);
  process.exit(blocking ? 1 : 0);
};
const pass = (msg) => { console.log(`pr-gate (${cfg.mode}): ${msg}`); process.exit(0); };

if (!existsSync(stampPath)) {
  fail(`no committed stamp for '${branch}' in .claude/reviews/. Run /pr-self-review, commit the stamp.`);
}
const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
if (stamp.head !== headSha) {
  fail(`stamp is for ${stamp.head.slice(0, 7)} but the PR head is ${headSha.slice(0, 7)} — stale. Re-run /pr-self-review and commit.`);
}
if (stamp.worktree !== "clean") {
  fail("stamp was computed on a dirty tree — commit every change, then re-run /pr-self-review so the stamp is clean.");
}
if (stamp.mode === "blocking" && stamp.verdict === "block") {
  fail("the last review verdict is BLOCK — confirmed CRITICAL(s) remain.");
}
pass(`fresh ${stamp.mode} stamp for ${headSha.slice(0, 7)}, verdict=${stamp.verdict}.`);
