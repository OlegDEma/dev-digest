# Report template

Two outputs from every run: a **human report** — printed to chat and saved to
`.claude/reviews/<branch>.report.md` (git-ignored) — and a tiny committed
**stamp** (`.claude/reviews/<branch>.stamp.json`) that the hook, a re-run, and CI
read to reuse the verdict without re-reviewing.

## Human report (fixed shape)

```
PR Self-Review — <branch> → main
Verdict: <🔴 BLOCKED | 🟡 PASS WITH WARNINGS | 🟢 PASS>   (N critical · M warnings · K suggestions)
Scope: <X> changed files in <buckets>  ·  <Y> excluded (vendor/generated/docs)
Tier 1:  tsc <✓|✗>   vitest <✓|✗>   next build <✓|✗|skipped>   arch:check <✓|✗|not wired>

CRITICAL — must fix before this PR opens
  <path>:<line> · <skill>/<rule>   [confirmed]
    <why: one line + the concrete failure scenario / reproduction>
    Fix: <specific change>

WARNING — should address, does not block
  <path>:<line> · <skill>/<rule>   [flagged, not confirmed]
    <why>
    Fix: <specific change>

SUGGESTION — optional  (showing top 10 of <K>)
  <path>:<line> · <skill>/<rule> — <one-liner>

Next: <fix the N criticals then re-run  |  nothing blocking — safe to open the PR>
```

Rules for the report:

- **Verdict line first** — the reader wants the block/pass answer immediately.
- Group by severity, then by file. Most-severe first.
- Every CRITICAL shows `[confirmed]` (survived verification) with its
  reproduction; a downgraded one shows `[flagged, not confirmed]`.
- Deduplicated: one line per issue; if several skills flagged it, list the extra
  rule ids inline (`react-best-practices/keys +1`).
- Cap SUGGESTIONs at ~10; summarise the rest as a count.
- If `arch:check` was skipped, say `not wired` (not `✓`) so the reader knows the
  onion boundary was reviewer-checked only.

## Verdict logic

```
if any Tier-1 check failed            → 🔴 BLOCKED
elif any CONFIRMED CRITICAL remains   → 🔴 BLOCKED
elif any WARNING                      → 🟡 PASS WITH WARNINGS
else                                  → 🟢 PASS
```

Only 🟢 and 🟡 may proceed to `gh pr create`. 🔴 refuses to open the PR (workflow
step 7): offer fixes, apply on approval, re-run. An explicit user override
("open anyway") is honored, but the PR description must then note the gate was
overridden and list the unresolved criticals.

## The stamp — `.claude/reviews/<branch>.stamp.json`

Do not hand-write it. Stage 5 calls the writer, which owns the schema in
`scripts/gate-lib.mjs` so the local check and CI can never disagree with it:

```bash
node scripts/pr-gate-check.mjs --write <pass|warn|block> \
     --counts '{"critical":1,"warning":3,"suggestion":5}' [--waivers <sig,…>]
```

The written stamp:

```json
{
  "skill": "pr-self-review",
  "version": "1.0.0",
  "base": "main",
  "head": "<git rev-parse HEAD>",
  "worktree": "clean | <sha256 of the uncommitted diff + untracked reviewed files>",
  "mode": "report-only | blocking",
  "verdict": "pass | warn | block",
  "counts": { "critical": 1, "warning": 3, "suggestion": 5 },
  "waivers": ["onion-architecture/R2 @ …:: a1b2c3d4e5f6"],
  "generated_at": "2026-09-21T…Z"
}
```

`head` + `worktree` are the freshness key: any edit after the review makes the
stamp STALE. `worktree: "clean"` is the only state CI can reproduce from a
checkout, so a stamp written on a dirty tree is local-only — commit everything,
then re-stamp. The detailed findings (file/line/skill/rule/consequence/fix) live
in the human report `.md` next to the stamp, not in the stamp itself. Validators
judge by the stamp's own `mode`, so flipping the mode never re-judges an old run.
