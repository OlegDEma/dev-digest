# Verification — confirm every CRITICAL before it blocks

The single biggest lever on trust. A gate that blocks on a *guess* gets disabled;
a gate that blocks only on *confirmed, reproducible* problems gets respected. So
no candidate CRITICAL blocks until a **separate** verifier agent has tried to
disprove it and failed.

Run this as step 4, once per candidate CRITICAL (deterministic Tier-1 failures are
already facts — skip them). Batch criticals that share a file into one verifier.

## Why a *separate* agent

The reviewer that raised the finding is primed to believe it. A fresh agent, told
its job is to *break* the claim, catches the reviewer's missing context — the
mitigation on the next line, the input that is actually server-controlled, the
guard in a parent component. This is the same adversarial pattern the DevDigest
reviewer and ultrareview use.

## Verifier brief (template)

> You are adversarially verifying **one** candidate CRITICAL from a pre-PR review.
> Your default assumption is that it is **wrong**. Try to disprove it.
>
> The finding: `<file, line, skill/rule, evidence, failure_scenario, fix>`.
>
> Do this:
> 1. **Read the real code** around `file:line` — the whole function, the symbols
>    it calls, the callers, any parent guard or middleware. Do not trust the
>    quoted evidence; re-read it in the file.
> 2. **Trace the data flow.** For a security/correctness claim, confirm the
>    triggering input or state is actually reachable **on the changed code** and
>    is attacker/caller-controlled — not a constant, env var, test fixture, dead
>    branch, or framework-mitigated path.
> 3. **Check upstream mitigations** — validation, auth middleware, type narrowing,
>    JSX escaping, a Zod schema at the rim — that already neutralize it.
> 4. **Reproduce the failure scenario** concretely: name the exact input/state and
>    the resulting wrong output/crash. If you cannot construct one, it is not a
>    CRITICAL.
>
> Return JSON only:
> `{verdict: "CONFIRMED" | "REFUTED", confidence: "high"|"medium"|"low",
>   reproduction: "<concrete input→bad outcome, or why none exists>",
>   note: "<mitigation found / context the reviewer missed, if any>"}`

## Applying the verdict

- **CONFIRMED (high confidence)** → stays **CRITICAL**. Blocks. Carry the
  `reproduction` into the report — that is what makes the block credible.
- **CONFIRMED (medium)** → CRITICAL but flagged "confirmed, reachability
  probabilistic"; still blocks (a real, plausibly-reachable defect).
- **REFUTED**, or cannot construct a reproduction → **downgrade to WARNING**
  labelled *"flagged, not confirmed — verify manually"*, and include the
  verifier's `note` (the mitigation/context) so the author sees why it was cleared.
  Never silently drop it; the author should still glance at it.

## The grounding bar (applies to reviewers too)

A finding at any severity must carry:

- **evidence** — the actual offending line(s), quoted from the file (not a
  paraphrase of the rule).
- **failure_scenario** — a concrete input/state → wrong output/crash/violation.
  "Violates rule X" is not a scenario; "when `req.query.limit` is `'; DROP…` the
  query interpolates it" is.
- **fix** — the specific change, in this repo's idiom.

Findings that cannot meet the bar are downgraded one level (CRITICAL→WARNING,
WARNING→SUGGESTION). This single rule removes most noise before it reaches the user.
