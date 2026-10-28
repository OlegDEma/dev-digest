# Retro: spec workflow — `docs/specs/2026-10-11-project-context.md`

Date: 2026-10-11 (facts regenerated with `--prices` on the same day) · Session: `27f63b63-fa46-49bb-87d5-c3510f1d59b6` · Window: session start → spec approval (`--until 2026-10-10T22:18:30Z`) · Workflow: `spec` skill (spec-creator + 3 investigators)

## Summary
- Tokens: 16.21M prompt-side (93% cache reads) / 199.8k output across 4 agents + main. Biggest consumer: spec-creator, 9.92M (61%), and 5.68M of that came from its last round alone.
- Cost (API list prices, cached 2026-10-06 in the `claude-api` skill; cache writes at the 5-minute rate, 1.25× input): **$12.38** for the approved spec. spec-creator $8.50 (69%), main $2.97, investigators $0.91 together. Cache reads are 93% of tokens but only about $3.00 of the bill. The expensive part is Opus output and cache writes. Parallelism factor 0.85; bottleneck: spec-creator (45% of wall clock).
- Outcome: the spec was approved at rev 4. Rev 1 passed its self-check but differed from the mentor's reference spec on 6 points, so rev 2 rewrote most of it. Rev 3 settled proposals and open questions, and rev 4 is the approval.
- Top problems:
  - One long-lived spec-creator was resumed 4 times. Its context grew from 109k to 367k tokens per prompt, and rev 2 was then done as 67 small Edits, each one re-sending that context.
  - Rev 1 missed points that a reference spec had (headline scenario, skipped docs in the trace, no version bump, guard untouched).
- Top recommendations:
  - For a large revision, start a fresh spec-creator from the file plus a decision list, and write the revised file in one `Write`.
  - Add a "reference spec / benchmark" input and a missing-AC checklist to spec-creator.

## Facts

# Workflow facts — session `27f63b63-fa46-49bb-87d5-c3510f1d59b6`

- Window: 2026-10-10 21:42 → 22:18 UTC (35m57s wall clock)
- Agents active in window: 4 (spawned by main: 4) (peak concurrently active: 3); resumes via SendMessage: 4
- Owner turns (user prompts): 9; skills invoked by main: spec, engineering-insights
- **Tokens, all agents + main:** input 244 · cache write 1.21M · cache read 15.00M · output 199.8k · API turns 115
  - total prompt-side tokens: 16.21M; cache-read share: 93% (cache efficiency; low ⇒ context churn)
- Tool calls: 284 total · parallelism factor 0.85 (sum of active time ÷ wall clock; <1 ⇒ idle time, e.g. waiting on the owner; >1 ⇒ agents really ran in parallel)
- Bottleneck: spec-creator `a991359a` — 16m01s active (45% of wall clock)
- **Cost:** $12.38

## Per agent (launch order)

| # | Agent | Model | Description | Start | Active | Turns | Prompt-side tok | Output tok | Tools | Errors | Resumes | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | main | claude-opus-5-5 | orchestrator | 0s | 10m31s | 25 | 4.82M | 29.9k | 18 | 0 | — | $2.97 |
| 1 | spec-creator `a991359a` | claude-opus-5-5 | Spec: Project Context | 27s | 16m01s | 55 | 9.92M | 151.2k | 157 | 1 | 4 | $8.50 |
| 2 | investigator `a765f0b4` | claude-sonnet-5-5 | R1 clone update lifecycle | 3m55s | 1m37s | 15 | 631.2k | 7.6k | 48 | 2 | 0 | $0.35 |
| 3 | investigator `af04dc04` | claude-sonnet-5-5 | R2 CI runner and run paths | 3m55s | 1m23s | 11 | 516.8k | 6.0k | 33 | 0 | 0 | $0.33 |
| 4 | investigator `a9de2d6c` | claude-sonnet-5-5 | R3 agent-uses-skill counting | 3m55s | 1m06s | 9 | 311.9k | 5.0k | 28 | 0 | 0 | $0.23 |

## Timeline

- +27s — main → spawn **spec-creator** (Spec: Project Context), prompt 4747 chars
- +3m41s — spec-creator `a991359a` segment ends (3m13s active)
- +3m44s — main → spawn **investigator** (R1 clone update lifecycle) [bg], prompt 469 chars
- +3m46s — main → spawn **investigator** (R2 CI runner and run paths) [bg], prompt 616 chars
- +3m48s — main → spawn **investigator** (R3 agent-uses-skill counting) [bg], prompt 399 chars
- +5m01s — investigator `a9de2d6c` segment ends (1m06s active)
- +5m19s — investigator `af04dc04` segment ends (1m23s active)
- +5m32s — investigator `a765f0b4` segment ends (1m37s active)
- +9m07s — main → resume `a991359a` (Owner answers + research reports), 2236 chars
- +9m16s — spec-creator `a991359a` segment ends (7s active)
- +12m42s — spec-creator `a991359a` segment ends (37s active)
- +16m14s — spec-creator `a991359a` segment ends (1m07s active)
- +20m03s — main → resume `a991359a` (Rev 2 edits from owner vs mentor spec), 4284 chars
- +20m23s — spec-creator `a991359a` segment ends (20s active)
- +32m26s — main → resume `a991359a` (Owner accepts P3, P6; defaults for rest), 1334 chars
- +35m35s — main → resume `a991359a` (Owner approves: set Status approved), 158 chars
- +35m45s — spec-creator `a991359a` segment ends (10m35s active)

## Rounds per agent (context growth)

Each active segment ≈ one round (initial run or a resume). `max ctx` = largest single prompt in the round.

| Agent | Round | Start | Turns | Prompt-side tok | Output tok | Max ctx |
|---|---|---|---|---|---|---|
| spec-creator `a991359a` | 1 | +27s | 26 | 2.09M | 8.6k | 108.9k |
| spec-creator `a991359a` | 2 | +9m08s | 3 | 383.1k | 104 | 133.0k |
| spec-creator `a991359a` | 3 | +12m05s | 2 | 306.4k | 38.8k | 167.6k |
| spec-creator `a991359a` | 4 | +15m07s | 3 | 578.4k | 3.7k | 194.7k |
| spec-creator `a991359a` | 5 | +20m03s | 4 | 885.6k | 2.1k | 239.2k |
| spec-creator `a991359a` | 6 | +25m10s | 17 | 5.68M | 97.9k | 367.3k |
| investigator `a765f0b4` | 1 | +3m55s | 15 | 631.2k | 7.6k | 63.3k |
| investigator `af04dc04` | 1 | +3m55s | 11 | 516.8k | 6.0k | 71.5k |
| investigator `a9de2d6c` | 1 | +3m55s | 9 | 311.9k | 5.0k | 51.4k |

## Tool mix per agent

- main: Bash×5, Agent×4, SendMessage×4, Skill×2, AskUserQuestion×2, Write×1
- spec-creator `a991359a`: Edit×67, Read×51, Grep×24, Glob×6, SubagentHandback×5, Skill×3, Write×1
- investigator `a765f0b4`: Grep×24, Read×19, Glob×4, SubagentHandback×1
- investigator `af04dc04`: Grep×16, Read×12, Glob×4, SubagentHandback×1
- investigator `a9de2d6c`: Read×15, Grep×11, Glob×1, SubagentHandback×1

## Duplicated reads

Files read by more than one agent (candidates for passing findings instead of re-reading):

- `server/src/modules/reviews/run-executor.ts` — spec-creator#a99135×3, investigator#af04dc×2, investigator#a9de2d×1
- `client/src/lib/hooks/core.ts` — spec-creator#a99135×1, investigator#a765f0×1
- `server/src/db/schema/agents.ts` — spec-creator#a99135×1, investigator#a9de2d×1
- `server/src/db/schema/repos.ts` — spec-creator#a99135×1, investigator#a765f0×1
- `client/src/components/app-shell/helpers.ts` — spec-creator#a99135×1, investigator#a765f0×1
- `server/src/modules/reviews/service.ts` — investigator#af04dc×1, investigator#a9de2d×1

Same agent read a file 3+ times:

- spec-creator#a99135: `server/src/modules/reviews/run-executor.ts` ×3
- spec-creator#a99135: `docs/specs/2026-10-11-project-context.md` ×4

## Files written per agent (delegation / scope check)

- main: `docs/research/2026-10-11-project-context.md`×1
- spec-creator `a991359a`: `docs/specs/2026-10-11-project-context.md`×68

## Failure taxonomy

- edit_anchor_miss×1, bad_search_input×1, missing_path×1

## Tool errors

- spec-creator `a991359a`: <tool_use_error>String to replace not found in file. String:   **Run-time injection (US-6)** - **AC-41** (event · US-6) WHEN a review run of an agent starts, th
- investigator `a765f0b4`: Search failed — ripgrep rejected the pattern, glob, or file type without searching: rg: error parsing glob '{server/src/**/*.ts,client/src/**/*.{ts,tsx},client/
- investigator `a765f0b4`: Path does not exist: /Users/oleh/Work/OlehDevDigest/server/src/modules/context. Note: your current working directory is /Users/oleh/Work/OlehDevDigest.

## What went well
- **The research fan-out was cheap and fast.**
  - All 3 investigators were spawned within 4 s of each other, in the background, at the same time as the owner's AskUserQuestion. Research and owner answers overlapped, so main did not wait on either.
  - Each investigator finished in 1m06s–1m37s. Together they used 1.46M prompt-side tokens, 9% of the total.
  - Each report came back with `path:line` evidence and a "Not searched" list. Facts: rows 2–4, timeline +3m44s–+5m32s.
- **The research was passed as a file, not pasted.**
  - Main wrote the reports once to `docs/research/2026-10-11-project-context.md` and sent spec-creator a 2,236-char resume pointing at that file.
  - Pasting three full reports would have added about 20k characters to the resume.
  - Spec-creator then cited R1–R3 without redoing any of them.
- **Round 1 produced well-formed blocking questions.** Spec-creator returned 4 of them, each with context, options, cost and a recommendation, plus 3 research requests. The owner answered all of them in a single AskUserQuestion call.
- **Self-check passed 9/9 in every revision**, and the owner caught no format or EARS defect.

## What was hard
- **spec-creator, round 6 (rev 2 → rev 4).**
  - The round cost 5.68M prompt-side tokens over 17 turns, with the largest single prompt at 367.3k (Rounds table).
  - The agent had already read 6 design images in round 1 and 19 mentor screenshots in rev 2. Every image stays in its context for the rest of the session.
  - The tool mix shows `Edit×67`: a near-total restructure done as small in-place edits. One edit failed with "String to replace not found" (Tool errors).
- **investigator R1** hit two tool errors:
  - a nested-brace glob that `rg` rejected (`{server/src/**/*.ts,client/src/**/*.{ts,tsx},…}`);
  - a guessed path `server/src/modules/context` that does not exist.

  Both cost a turn each. It still finished with zero gaps on the question.
- **Main session, 4.82M prompt-side tokens for 25 turns.** The owner pasted 6 design images and later 19 reference screenshots into main, and all of them are re-sent on every main turn.

## Duplicated information
- **`run-executor.ts` was read 6 times by 3 agents:** spec-creator ×3, R2 ×2, R3 ×1. The spec-creator had already cited `run-executor.ts:220-243`, `:355` and `:402-423` in its round-1 report. The research prompts were passed verbatim and did not include those citations, so the investigators re-read the file.
- **The spec file was re-read ×4 by its own author** between revisions.
- **The screenshots were held twice:** both main and spec-creator kept all 25 images in their contexts. Main needed them only to compare against the spec and to forward their paths.

## What was missed
- **Rev 1 lacked 4 items that the mentor's reference spec had:**
  - the headline e2e scenario (now AC-45);
  - skipped documents recorded in the trace (`specs_missing`);
  - an AC that attaching does not bump the version;
  - a non-goal saying the injection guard stays unchanged. Rev 1 even *changed* the guard (old AC-65).

  The owner caught these by comparing against the reference, not through any check in the workflow.
- **Rev 1 discovery and page scope were reversed in rev 2.** Spec-creator had recommended "all `*.md`" and "browse-only", and the owner accepted both in round 1. The mentor's bucket rule and edit-in-place replaced them in rev 2.
- **Main's reports caused confusion about where the spec was.** The research file and the spec share the same file name (`2026-10-11-project-context.md`) in `docs/research/` and `docs/specs/`. The owner concluded the spec had been "saved to research".
- **Main promised to show the rev 1 → rev 2 diff but could not.** `docs/specs/` was untracked and no copy of rev 1 had been kept.

## Owner load
- 9 owner turns, 2 AskUserQuestion calls with 8 questions in total, 4 resumes, and 4 revisions.
- **Recommendations the owner overrode:**
  - Q1 (attach per repo → workspace-wide by path);
  - later, Q2 and Q3, reversed after the reference comparison.
- Rev 2 needed a 4,284-char resume listing the reference-spec deltas. That cost was caused by the content gaps listed above.

## Recommendations
| # | Change | File | Expected effect | Evidence |
|---|---|---|---|---|
| 1 | When a revision touches more than about 30% of the ACs, or the agent's context is above about 200k tokens, start a **fresh** spec-creator with: the spec path, the decision list, the research path and *text summaries* of the images. Do not resume the old agent. | `.claude/skills/spec/SKILL.md` (Loop, step 6) | Round-6 style cost (5.68M) drops to roughly a round-1 cost (about 2M) | Rounds table: max ctx 109k → 367k |
| 2 | For a structural rewrite, produce the revised spec with **one `Write`** of the whole file after reading it once, instead of many `Edit` calls. | `.claude/agents/spec-creator.md` (writing rules) | Fewer turns, so less context re-sent; no "string not found" retries | `Edit×67`, 1 Edit error |
| 3 | Add a **completeness checklist** to the spec-creator self-check: a demo/headline scenario AC; skipped or failed items made observable in traces/UI; config-mutation vs versioning; an explicit statement of which pipeline invariants stay untouched; "zero new LLM/network calls" when relevant. | `.claude/agents/spec-creator.md` (self-check) | Catches the 4 items rev 1 missed | *What was missed* §1 |
| 4 | Accept an optional **reference spec / benchmark** input in `spec`, and have spec-creator diff its draft against it before returning. | `.claude/skills/spec/SKILL.md` (Inputs) | The owner no longer runs the comparison by hand | Rev 2 resume of 4,284 chars |
| 5 | When relaying research requests, append the `path:line` citations spec-creator already gave for that topic, with "do not re-read these". | `.claude/skills/spec/SKILL.md` (step 2) | Removes the re-reads of `run-executor.ts` | *Duplicated reads* |
| 6 | Give the research file a distinct name (`docs/research/<slug>.research.md`), and have main state both paths in every report. Snapshot each spec revision to the scratchpad (or commit the draft) so a diff can be shown. | `.claude/skills/spec/SKILL.md` (step 5); `docs/research/README.md` | No "saved to research" confusion; the rev diff can be shown | Owner turn after rev 1; no git diff available |
| 7 | Add to investigator: use `--glob` with a single brace level (or several `--glob` flags), and `Glob` before `Read` on a guessed path. | `.claude/agents/investigator.md` | Avoids R1's 2 wasted turns | Tool errors |
