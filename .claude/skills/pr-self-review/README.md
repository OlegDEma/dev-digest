# pr-self-review — maintainer notes

For humans maintaining this skill. The agent reads `SKILL.md`; you read this.
**v1.0.0**, ships in `report-only`.

## What it is

Three parts that must stay in sync:

1. **`SKILL.md` + `routing.md`** — the six-stage review workflow and its tables.
2. **`scripts/pr-gate-check.mjs`** (+ `gate-lib.mjs`) — the stamp validator.
   Reviews nothing; answers "is there a fresh passing review for exactly this
   tree?" in milliseconds. Also writes the stamp (`--write`). **Not wired to a
   hook by default** — see *Invocation*.
3. **`scripts/pr-gate-ci.mjs` + `.github/workflows/pr-gate.yml`** — the CI half,
   because a local hook cannot hold GitHub's Merge button.

The deterministic checks and the fan-out reviewers are the review itself;
`references/` holds their briefs. The stamp is how a run's verdict survives to the
hook, a re-run, and CI without re-reviewing.

## Files

| File | Audience | Contents |
|---|---|---|
| `SKILL.md` | agent | The six-stage workflow |
| `routing.md` | agent + human | Slices, skill map, severity scale, `mode`, caps (+ the config the scripts read) |
| `waivers.md` | agent + human | How to waive, the ledger, the three-strike rule |
| `references/*` | agent | Tripwires, verifier brief, deterministic commands, report + stamp schema |
| `scripts/*` | both | Diff collector, deterministic gate, stamp validator/writer, CI check, hook guard |
| `README.md` | human | This file |
| `CHANGELOG.md` | human | Version history |

## The two design decisions worth defending

**The gate owns the severity scale.** Three skills in this repo define severity
and disagree with each other; ten define none. Mapping between vocabularies is
guesswork, so reviewers classify against one table in `routing.md` regardless of
what the source skill calls its levels. The load-bearing part is the rule that a
CRITICAL must state a production consequence — without it, "violates the layering
convention" would block merges, and the gate would be gone in a week.

**It delegates rather than reimplements.** `/code-review` and `/security-review`
already exist in the harness to find bugs; this skill routes, unifies severity,
and decides. That is also why the vendored `security` skill is not routed: it
assumes Express + MongoDB + Mongoose, and this stack is Fastify +
Drizzle/Postgres, so its examples do not match the code under review. The security
surface that does apply lives in tripwires T5 (unauthenticated route) and T8
(committed secret).

## Invocation — manual, on purpose

`.claude/settings.json` ships as `{}` — **no hooks**. `/pr-self-review` is run by
hand; nothing intercepts `gh pr create`.

An automatic gate at the moment a change is finished is friction, and the first
time it is wrong at an inconvenient hour it gets deleted outright, value and all.
Manual invocation keeps it a tool rather than a toll.

To arm it for a team that wants it enforced locally, copy the `hooks` block from
`.claude/settings.json.hook-example` into `.claude/settings.json`. That file
exists so the working configuration is not lost, only unplugged; the hook body is
`scripts/pr-gate-guard.sh`, which fires only on `gh pr create` / `git push` and
blocks (exit 2) when `pr-gate-check.mjs` finds no fresh passing stamp. Record the
switch in `CHANGELOG.md` — it changes whether this skill can stop someone's work.

CI is unaffected either way: `pr-gate.yml` runs on every PR regardless of local
settings, and it is the half a branch-protection rule can hold Merge on.

## Turning the blocking verdict on

It ships in **`report-only`**: nothing is blocked, the report says what *would*
have been. Run it on a few real PRs, read the findings, then set `mode: blocking`
in `routing.md`'s config block — with a CHANGELOG entry, because that is the one
setting that decides whether the skill can stop someone's work.

The mode is copied into the stamp on each run and every validator reads it from
there, so flipping the mode never retroactively re-judges an existing review.

## Making the Merge button obey

The local hook is honour-based; branch protection is not. Make these required
checks on `main` (repo-admin action, not something this skill can do):

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection/required_status_checks \
  -f strict=true \
  -f 'contexts[]=conventions' \
  -f 'contexts[]=tests' \
  -f 'contexts[]=typecheck' \
  -f 'contexts[]=browser flows'
```

`conventions` is this workflow's job name; `tests` / `typecheck` / `browser flows`
are existing suites (client.yml, server-unit.yml, e2e-web.yml). Verify the exact
strings against a real PR's checks list first — GitHub matches them literally, and
a typo yields a check that is required and never reported, which blocks every PR
forever.

## Two caveats on first install

- **The workflow only counts once it is on `main`.** `pr-gate.yml` evaluates a PR
  against the workflow file on the base branch, so `conventions` will not appear
  as a check until this lands on `main`.
- **Claude Code watches settings that existed at session start.** `.claude/settings.json`
  is new here, so in the session that created it a copied-in hook may not fire
  until you open `/hooks` once or restart the session. It is live from the next
  session regardless.

## Changing the skill

One PR, all of it:

1. `SKILL.md` / `routing.md` — the workflow or the tables
2. the scripts, if the stamp contract in `gate-lib.mjs` changed (change it in one
   place — the local check, CI, and the writer all import it, on purpose)
3. `CHANGELOG.md` + `metadata.version` in the `SKILL.md` frontmatter
4. the `vX.Y.Z` badge in the catalog row of `.claude/skills/README.md`

Semver: **major** — the gate blocks something it used to allow (including
`report-only` → `blocking`); **minor** — new checks, new routing, new stages that
do not newly block; **patch** — wording, caps, link fixes.

After changing a rule, verify it still bites: the `evals/` fixtures plant a
violation and assert the rule name shows up. A clean run on clean code proves
nothing on its own — precision and recall are separate, and the fixtures measure
both.

## Deliberate omissions

- **No LLM review in CI.** Every workflow here is `contents: read` with no
  secrets, and adding an `OPENROUTER_API_KEY` is a decision about cost and supply
  chain, not a detail. `reviewer-core` is already shaped for it —
  `reviewPullRequest` (`reviewer-core/src/review/run.ts`) takes a parsed diff plus
  resolved skill bodies with no DB coupling, and `parseUnifiedDiff`
  (`server/src/adapters/git/diff-parser.ts`) is pure. A thin `tsx` CLI over those
  two plus `OpenRouterProvider` is the whole of a future phase 2; the CI half here
  deliberately only validates the stamp.
- **No PR comments.** No workflow here has `pull-requests: write`. Findings live in
  `.claude/reviews/` (report git-ignored, stamp committed) and in the drafted PR
  body.
- **No auto-fix.** Applying fixes and gating the same change in one pass makes the
  verdict untrustworthy. Fix, then re-run.
