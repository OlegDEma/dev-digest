---
name: pr-self-review
description: >-
  Local pre-PR review GATE for this DevDigest repo. ALWAYS run this before
  opening or updating a pull request — before `gh pr create`, before pushing a
  branch that will become a PR, and whenever the user says "open a PR", "create a
  pull request", "is this ready to merge/ship", "review my changes", "can I push
  this", "self review", or asks for a pre-merge check. It collects every pending
  change (branch vs main PLUS the working tree), cuts it into slices, runs the
  repo's own deterministic checks (tsc, tests, next build), routes each slice to
  the project's existing skills — frontend-ui-architecture, react-best-practices,
  next-best-practices, react-testing-library on client code; onion-architecture,
  fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod on
  server/reviewer-core; typescript-expert across both — plus DevDigest-specific
  cross-file tripwires (contract drift, snake_case/camelCase mapping, enum casing,
  schema-without-migration, unauthenticated routes, committed secrets). Every
  CRITICAL is adversarially verified before it counts, the verdict is written to a
  stamp, and in blocking mode a confirmed CRITICAL refuses to open the PR until
  fixed, waived, or explicitly overridden. Ships in report-only mode. Do NOT run
  for an empty diff, a docs-only diff, or a WIP checkpoint the user labels
  not-ready. Trigger terms: PR self-review, pre-PR review, pre-merge check,
  /pr-self-review, review before push, gate my changes.
metadata:
  # Workflow / dispatcher: this skill does not review on its own — it slices the
  # diff and routes each slice to the repo's other skills (stages 3-4).
  type: workflow
  version: 1.0.0
  tags: review, pr, pre-merge, gate, quality, orchestration, workflow
---

# PR Self-Review

A **merge gate that runs on your machine before GitHub sees the change.** It
invents no rules — it routes the diff to the review skills this repo already has,
runs the repo's own deterministic checks, unifies every finding under one severity
scale, **adversarially verifies each CRITICAL**, and records the verdict in a
stamp. In blocking mode it refuses to open the PR while a confirmed CRITICAL
remains; it ships in **report-only**, where it says what *would* block.

The value is a gate people trust: it blocks only on confirmed, reproducible
problems and says exactly why and how to fix each one. Precision matters as much
as recall — a gate that cries wolf gets deleted, value and all.

## The six stages

Work through them in order. Stages 3–4 fan out to subagents; `caps` in
[`routing.md`](routing.md) bound the fan-out (default ≤4 reviewers).

### 1 — Collect

```bash
bash .claude/skills/pr-self-review/scripts/collect-diff.sh    # changed files, excludes applied
node  .claude/skills/pr-self-review/scripts/pr-gate-check.mjs  # is a fresh passing stamp already here?
```

`collect-diff.sh` prints the review set (branch vs `main` **plus** the working
tree). If it is empty, or only docs/markdown, stop — nothing to gate. If
`pr-gate-check.mjs` prints `PASS`, a fresh review already covers this exact tree;
say so and skip to reporting unless the user forces a re-run. Otherwise **cut the
files into slices** per [`routing.md`](routing.md).

### 2 — Deterministic gate (Tier 1)

```bash
bash .claude/skills/pr-self-review/scripts/run-gates.sh        # tsc · vitest · next build · arch:check if wired
```

> **Stop `pnpm dev` first.** The gate runs `next build` (`scripts/run-gates.sh:51`),
> and a build while the dev server is up corrupts the shared `client/.next/` (every
> route then 500s with `Cannot find module './617.js'`). Stop the dev server,
> `rm -rf client/.next`, then run the gate — or set `SKIP_BUILD=1`.

Zero false positives. **Any failure is a deterministic CRITICAL** — record it and
continue, so the report is complete. Details and the supply-chain-gate caveats are
in [`references/deterministic-checks.md`](references/deterministic-checks.md).

### 3 — Route & review (Tier 2)

Also scan every slice for the cross-file
[`references/repo-tripwires.md`](references/repo-tripwires.md) — the bugs that
compile fine and slip past file-local review. Then spawn one reviewer per folded
slice (Frontend, Backend) with this brief:

> **Reviewer brief** — Review ONLY the changed lines in: `<files>`. First READ
> each full file and the symbols it imports/calls, so you never flag what the
> surrounding code already handles (e.g. an aria-label on the next line). Apply
> the skills for this slice from [`routing.md`](routing.md) by reading their
> `SKILL.md`, and the tripwires. Classify with the single severity table in
> `routing.md`; **a CRITICAL must name a concrete production consequence**
> (input/state → wrong output/crash/exposure) or it is not one. Ground every
> finding: quote the line, give the scenario. Honor each skill's own "do NOT flag"
> lists (tests, dead code, server-controlled values, framework-mitigated).
> Return JSON only: `[{file, line, severity, confidence, skill, rule, evidence,
> failure_scenario, fix}]`.

### 4 — Verify & waive

For each candidate CRITICAL (deterministic failures are already confirmed), spawn
a verifier with the brief in [`references/verification.md`](references/verification.md);
it tries to *disprove* the finding. CONFIRMED stays CRITICAL; REFUTED downgrades to
a "flagged, verify manually" WARNING. Then apply any waivers per
[`waivers.md`](waivers.md) (with the three-strike rule). De-dup findings across
slices, rank most-severe-first, cap SUGGESTIONs per `caps`.

### 5 — Decide & stamp

Read `mode` from [`routing.md`](routing.md). Compute the verdict:

```
Tier-1 failure OR (confirmed, unwaived CRITICAL)  → block
else any WARNING                                  → warn
else                                              → pass
```

Write the stamp (this is what a re-run, the hook, and CI read):

```bash
node .claude/skills/pr-self-review/scripts/pr-gate-check.mjs --write <pass|warn|block> \
     --counts '{"critical":N,"warning":M,"suggestion":K}' [--waivers <sig,…>]
```

Write the full human report alongside it to
`.claude/reviews/<branch>.report.md` (git-ignored; the stamp is what gets
committed). Both follow [`references/report-template.md`](references/report-template.md).

### 6 — Report & act

Print the report: verdict + counts first, Tier-1 line, then findings by severity →
file, each with skill/rule/location/consequence/fix, then any **Waived**.

- **report-only** (default) — nothing is blocked; state the verdict that *would*
  apply in blocking mode, and proceed.
- **blocking** + `block` — do **not** open the PR. For each confirmed CRITICAL,
  offer a fix; on approval apply it and **re-run from stage 1** (no auto-fix in the
  same pass — applying and judging one change at once makes the verdict
  untrustworthy). An explicit "open anyway" is honored, but note the override and
  the unresolved criticals in the PR body.

On a non-trivial review that surfaced a novel gotcha, offer to record it via the
`engineering-insights` skill.

## What this owns vs. defers

Owns: slicing, the deterministic gate, tripwires, orchestrating reviewers +
verifiers, the one severity scale, the stamp, and the decision. It adds **no new
lint rules** — every finding is attributed to an existing skill or a named
tripwire. It does not route the `security` skill (Express/Mongo mismatch) and does
not reimplement `/code-review` / `/security-review`; see
[`routing.md`](routing.md) → *What is not routed*. Enforcement is manual by design
— see [`README.md`](README.md).

## Files

- [`routing.md`](routing.md) — slices, skill map, the severity scale, `mode`, caps (and the config the scripts read).
- [`waivers.md`](waivers.md) — how to waive, the ledger, the three-strike rule.
- [`references/repo-tripwires.md`](references/repo-tripwires.md) — the cross-file DevDigest checks.
- [`references/verification.md`](references/verification.md) — the adversarial verifier brief + grounding bar.
- [`references/deterministic-checks.md`](references/deterministic-checks.md) — exact per-package commands, supply-chain caveats, hook/CI recipes.
- [`references/report-template.md`](references/report-template.md) — the report + the stamp schema.
- `scripts/` — `collect-diff.sh`, `run-gates.sh` (deterministic halves); `pr-gate-check.mjs`, `pr-gate-ci.mjs`, `gate-lib.mjs`, `pr-gate-guard.sh` (the stamp contract).
- [`README.md`](README.md) — for maintainers. [`CHANGELOG.md`](CHANGELOG.md) — version history. `evals/` — the self-eval harness.
