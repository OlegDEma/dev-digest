# Control experiments — does binding a skill change what an agent finds?

Date: 2026-09-23 (specialists) / 2026-09-28 (generic agent, criteria 17-18) · Repo under review: `OlegDEma/dev-digest` · Model:
`openrouter/deepseek/deepseek-v4-flash`

Two PRs were opened **specifically as experiment fixtures**, each carrying a
defect the matching skill is meant to catch:

| PR | Branch | Fixture |
|---|---|---|
| [#2](https://github.com/OlegDEma/dev-digest/pull/2) | `exp/test-quality-happy-path` | `nextRetryDelayMs` / `shouldRetry` with 6 branches; the test covers only the happy path |
| [#3](https://github.com/OlegDEma/dev-digest/pull/3) | `exp/api-contract-breaking-change` | three breaking changes: an optional input made required, a renamed route param, an enum value removed |

Method: run the agent on the PR with its skills **unbound**, then with them
**bound**, changing nothing else. Bindings were recorded first and restored after.

---

## Result — run on a GENERIC agent (criteria 17 / 18)

`General Reviewer` — a reviewer whose system prompt is **not** specialised for
tests or contracts — on the same two PRs, skills unbound then bound. Nothing else
changed. (Its model was `openai/gpt-4o-mini:batch`, which 404s on the
chat/completions endpoint; switched to `deepseek/deepseek-v4-flash`, the model the
other four agents already run on.)

### 17 — PR #2, test-quality skills

| | findings | what it actually said |
|---|---|---|
| **without** | 3 (score 82) | one vague `SUGGESTION — Minimal test coverage misses edge cases`; **no branch named**. The other two are generic bug observations, not coverage. |
| **with** | 6 (score 28) | one `WARNING` **per uncovered branch**, each named: non-integer attempt, negative attempt, `attempt === 0`, the `maxMs` clamp, `maxAttempts <= 0`, `shouldRetry` returning false. |

Without the skill the agent notices "tests are thin" and stops. With it, every
uncovered branch and the boundary case are called out individually — which is what
the criterion asks for.

### 18 — PR #3, API-contract skills

| | findings | what it actually said |
|---|---|---|
| **without** | 2 (score 53) | caught the route-param mismatch (a plain crash bug, not a contract issue) and hedged on the enum: `WARNING — may break other consumers`. **Missed the `description` optional → required change entirely.** |
| **with** | 4 (score 0) | all `CRITICAL`: the `description` breaking change (missed before), the enum removal (WARNING → CRITICAL), the route path change without backward compatibility, and the param mismatch. |

The skill turned a missed breaking change into a CRITICAL and stopped the hedging
on a second one.

**Both criteria are demonstrated on the generic agent.**

---

## Why the SPECIALIST agents did not show the same contrast

Run first against `Test Quality Reviewer` and `API Contract Reviewer`, the premise
"without the skill the agent misses it entirely" did **not** hold — and the reason
is instructive: those seeded agents already carry the same rules in their own
system prompt (`docs/agent-prompts/`). Asking whether `Test Quality Reviewer` needs
a test-quality skill to notice a coverage gap is a question its prompt has already
answered, so the skill can only refine what is already there.

That is why the criterion has to be measured on a generic agent (above): it
isolates the skill's contribution instead of measuring it on top of a prompt that
already contains it. Kept below as the record of what the specialists did.

### Experiment 17 — Test Quality Reviewer on PR #2

| | findings | character |
|---|---|---|
| without skills | 3 × CRITICAL | coarse: "parameter validation branches untested", several branches merged into one finding |
| with skills | 6 × WARNING | one finding **per branch** (non-integer, negative, `attempt=0`, the `maxMs` clamp, `maxAttempts<=0`, the `attempt>=maxAttempts` boundary), each naming the missing case |

The skill changed both the granularity (3 → 6, one per branch, as
`uncovered-branches` §Procedure instructs) and the severity calibration
(CRITICAL → WARNING, which matches the gate's own scale — a missing test is a
degradation, not a shipped defect).

### Experiment 18 — API Contract Reviewer on PR #3

| | findings |
|---|---|
| without skills | 3 × CRITICAL — all three breaking changes |
| with skills | the same 3, **plus** `WARNING — Breaking changes without a Major version bump` |

This is the cleanest evidence in the set: the fourth finding exists **only** in the
with-skills arm and is directly attributable to the `semver-discipline` skill
added in this change. Nothing else differed between the two runs.

### Prompt-assembly evidence (criteria 19 / 20)

From the run trace of the with-skills arm:

```
prompt_assembly keys: user, specs, memory, skills, system, callers, repo_map, pr_description
  skills: 7932 chars   ← its own block, its own token count in the trace UI
```

In the without-skills arm the `skills` key is `null` and the block is absent from
the trace entirely — an unbound (or globally disabled) skill leaves no trace block,
which is what criterion 20 asks for.

---

## Two real bugs this experiment uncovered

Neither is in the Conventions work; both are in how DevDigest fetches a PR diff,
and both made the first three runs review **an empty or wrong diff** while
reporting success.

1. **The clone is single-branch.** `git config remote.origin.fetch` on
   `server/clones/OlegDEma/dev-digest` is `+refs/heads/main:refs/remotes/origin/main`,
   so a PR head commit is never fetched and `git diff base...head` always throws.
   The fallback (`diffFromPrFiles`) is also empty because `pr_files` holds **0 rows
   for every PR in this repo** — so the reviewer ran on an empty diff and returned
   "0 findings, score 100", indistinguishable from a clean PR.
2. **The clone's local branch refs are never updated.** After fetching, local `main`
   still pointed at `c6af1e4` while `origin/main` was `a8df1d4`. `pull.base` is the
   branch *name*, so `git diff main...head` resolved against the stale ref and
   produced a **69-file, 289k-character** diff for a 2-file PR.

Both were worked around by hand for this experiment
(`git fetch origin '+refs/heads/*:refs/remotes/origin/*'` and
`git update-ref refs/heads/main refs/remotes/origin/main`). The product fix is to
widen the clone refspec and fast-forward local refs on refresh.

## Reproducing

1. Pick an agent whose system prompt is not specialised for the dimension under
   test (`General Reviewer`).
2. Record its skill bindings, then unbind: `POST /agents/:id/skills {"skill_ids": []}`.
3. `POST /pulls/:id/review {"agentId": …}` and read `findings_count` + the findings.
4. Bind the skills under test, re-run, compare. Restore the original bindings.
5. **Sanity-check every run**: read `prompt_assembly.user` from `/runs/:id/trace`
   and confirm `## Diff to review` is not empty. Three runs were wasted before this
   check was added — see the two bugs below.
