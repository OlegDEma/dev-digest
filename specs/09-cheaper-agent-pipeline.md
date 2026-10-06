# 09 — Cheaper agent pipeline: same checks, fewer tokens

> Status: **approved + applied** (2026-09-30; owner accepted all §12 defaults). Scope: `.claude/agents/**`
> (5 agent files + README), the main session's working rules (memory + README
> section). No package code, no schema, no contracts. EARS criteria in §8.
> Origin: token analysis of the spec-08 (Intent Layer) run.

## 1. Summary

The spec-08 run used ≈ 731k subagent tokens + a 260k-token main context:

| Agent | Model | Tokens |
|---|---|---|
| researcher (external) | sonnet | 41 191 |
| researcher (repo) | sonnet | 96 556 |
| planner | opus | 121 775 |
| implementer | sonnet | 205 464 |
| architecture-reviewer | opus | 129 300 |
| plan-verifier | opus | 136 506 |

Five agents read the same ~30 files from scratch. The planner re-verified research
it had been handed, on opus. Architecture review ran only after the code, so three
design-level findings (AR-1 SSRF, AR-3 cross-repo issues, AR-4 dropped findings)
forced rework. Two live bugs (404 `temperature`, 402 `max_tokens`) surfaced only
at the main session's manual check, so the fix loop ran in the most expensive
place, the opus main context that is re-read every turn.

This plan changes **who reads what, when, and on which model**. It keeps every
existing check:

- architecture review;
- independent plan verification;
- test runs;
- the live run;
- the owner's plan approval.

**Target:** subagents ≈ 420–480k (−35…40%) and main context ≈ 150k on a
spec-08-sized feature. These are estimates; §11 V6 measures them.

**Out of scope:**
- pipeline agents not named below (test-writer, doc-writer, investigator, brainstorm, insight-curator);
- the product's own review prompts. Prompt-caching the diff across N reviewer agents is a separate idea, see §12;
- hooks or settings that enforce any of this mechanically.

## 2. Decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | **Compact reports, in-message.** researcher, architecture-reviewer and plan-verifier cap their final message at **≈ 1 500 tokens**: one line per finding with `path:line`, no quoted code blocks longer than 3 lines, and a "Not found / not verified" list kept intact. *Correction to the chat proposal:* "full report to a file" is dropped, because these agents are read-only (no `Write`) and must stay so. | The main session's context grows by ~1.5k per agent instead of 3–6k. Detail is lost only in prose, not in evidence. |
| D2 | **Spec §3 is the shared code map.** *Correction to the chat proposal:* no separate `context-pack.md`. The planner already writes §3 "What already exists — do not rebuild" with `path:line`. It now also lists the **files the change will touch** (a "Code map" sub-table). implementer, plan-verifier and architecture-reviewer are told to **start from §3 and open files point-wise** instead of re-discovering them. | Removes most of the repeated discovery reads. No new artifact or permission. |
| D3 | **Planner trusts pasted research.** When the prompt contains a researcher report, the planner verifies only the lines it will cite as *change sites*. It does not re-trace flows the report already evidences. | Cuts opus re-reading. The "do not rebuild" sweep (`planner.md:106`) stays mandatory. |
| D4 | **Architecture review moves before the code.** New pipeline order: planner → **architecture-reviewer on the plan** → owner approval (the owner sees both) → implementer. After the code, a **lite** pass reviews only the files the spec's §10 Risks marks security- or boundary-sensitive, plus any file the implementer reports as a deviation. | Design defects are caught at plan cost. The post-code opus pass shrinks to a few files. |
| D5 | **plan-verifier → `model: sonnet`**, `effort: high` kept. Point-by-point AC matching and running commands is mechanical. opus stays on planner and architecture-reviewer, where judgment is the product. | ≈ −60% cost for the verifier. Risk and mitigation are in §10 R1. |
| D6 | **Implementer report doubles as the change manifest.** Its report (`implementer.md:205`) must add `git diff --stat`, and each AC row must name the **test name + file:line** that covers it. plan-verifier still treats the report as a claim to refute (`plan-verifier.md:27`). It re-runs the commands itself and opens each cited test, but stops searching for *where* things changed. | Verifier discovery drops. Independence is preserved, because every claim is still checked first-hand. |
| D7 | **Live smoke inside the implementer, only when authorised.** When the spec's §11 has a live command and the implementer's prompt explicitly says the owner approved the spend, the implementer runs it once at the end of the relevant phase. Without that line it lists the command as "not run: needs owner approval". | 404/402-class bugs surface before review. No LLM spend without the owner's yes. |
| D8 | **Fix loops go back to the same implementer** via `SendMessage` with a short findings list. The main session never edits code to fix review findings, only trivial one-liners (≤ 3 lines). | Fixes run on sonnet with a warm context, not in the opus main context. |
| D9 | **Main-session hygiene rules** go in README and memory: screenshots at `scale: 0.5`; `preview_logs` always with `search` and `lines ≤ 20`; command output filtered to summary lines; read specs via the planner's summary, not in full; `grep`/`sed -n` ranges instead of whole-file reads. | Main context ≈ −10…20k per feature. This is a working rule only, with no enforcement (§10 R4). |
| D10 | **Cache-friendly hand-off prompts.** Prompts to parallel reviewers start with an **identical block**: spec path, spec §3 pointer, implementer manifest. The agent-specific instructions come last. | Maximises the shared prompt prefix that Claude's prompt cache can reuse. The gain is unmeasured (§12). |
| D11 | **Planner returns a ≤ 40-line summary** as its final message: decisions, AC ids with one line each, risks, open questions. The main session shows the owner **the spec file itself** for approval, together with this summary. | Complements memory `plan-review-before-implementer`. The owner reads the real plan, and the main session does not load it. |
| D12 | **Repo researcher is optional for single-module features**: the planner does that discovery itself. It stays for cross-package features like spec 08. External research is unchanged. | Saves one agent on small features. |

## 3. What already exists — do not rebuild

| Thing | Where |
|---|---|
| Agent models / effort / maxTurns | frontmatter of each `.claude/agents/*.md` (researcher sonnet/40, planner opus/80, implementer sonnet/150, architecture-reviewer opus-high/35, plan-verifier opus-high/50) |
| architecture-reviewer already accepts a **plan** as target | `.claude/agents/architecture-reviewer.md:8,53,193` |
| plan-verifier already treats the implementer report as a claim to refute | `.claude/agents/plan-verifier.md:27` |
| Implementer report format (AC status, Changes, Verification…) | `.claude/agents/implementer.md:205-256` |
| Planner "do not rebuild" sweep + plan skeleton | `.claude/agents/planner.md:106,179-245` |
| researcher report formats (Mode R / Mode E) | `.claude/agents/researcher.md:137,205` |
| Pipeline diagram + catalog | `.claude/agents/README.md:14-60` |
| "Owner reviews the spec before implementer" rule | memory `plan-review-before-implementer.md` |

### Code map — files this plan touches
`.claude/agents/{planner,implementer,architecture-reviewer,plan-verifier,researcher}.md`,
`.claude/agents/README.md`, memory `plan-review-before-implementer.md` (+ a new
`main-session-token-hygiene.md`), `specs/README.md` (index line).

## 4–7. Data model / Contracts / Server / Client

None.

## 8. Acceptance criteria (EARS)

- **AC-1** When researcher, architecture-reviewer or plan-verifier finishes, its final message shall be ≤ ≈ 1 500 tokens and shall still contain every finding's `path:line` and a "not found / not verified" list.
- **AC-2** When the planner writes a spec, §3 shall include a "Code map" of files the change will touch, and the planner's final message shall be a ≤ 40-line summary.
- **AC-3** Where the planner's prompt contains a researcher report, the planner shall re-verify only the change-site lines it cites.
- **AC-4** When a spec is written, the pipeline shall run architecture-reviewer on the plan **before** the owner is asked to approve it, and the owner shall be shown the spec file and the review together.
- **AC-5** When the implementer finishes, its report shall include `git diff --stat` and, per AC, the covering test name + `file:line`.
- **AC-6** While the implementer's prompt does not state owner approval for live spend, the implementer shall not call a paid LLM, and shall list the live command as "not run: needs owner approval".
- **AC-7** The plan-verifier frontmatter shall be `model: sonnet`, `effort: high`, and it shall still re-run the verification commands itself and open every cited test.
- **AC-8** When review findings need code changes, the main session shall send them to the same implementer via `SendMessage`, except fixes of ≤ 3 lines.
- **AC-9** After the code, the architecture-reviewer pass shall be limited to the files §10 marks sensitive plus reported deviations.
- **AC-10** README shall document the new pipeline order, the hand-off prompt template (D10) and the main-session hygiene rules (D9). The catalog shall show plan-verifier on `sonnet`.

## 9. Implementation plan

All edits are in markdown. Keep each agent's existing structure and append or
amend in place; do not rewrite files.

| # | Step | File | AC |
|---|---|---|---|
| A1 | Report cap + compact finding line format; keep "Not found" | `researcher.md` (both report formats) | AC-1 |
| A2 | Same cap for the verdict | `architecture-reviewer.md` (Output section) | AC-1 |
| A3 | Add a "Post-code lite mode: only §10-sensitive files + deviations" paragraph | `architecture-reviewer.md` | AC-9 |
| A4 | `model: opus` → `sonnet`; cap the report; "start from spec §3 + implementer manifest; open each cited test" | `plan-verifier.md` | AC-1, AC-7 |
| A5 | §3 gains a "Code map" sub-table. The final message becomes a ≤ 40-line summary. Add the "trust pasted research, verify only change sites" rule next to the sweep. | `planner.md` | AC-2, AC-3 |
| A6 | Report gains `git diff --stat` + per-AC test name/`file:line`. Add a live-smoke rule gated on explicit owner approval in the prompt. Add "start from spec §3". | `implementer.md` | AC-5, AC-6 |
| B1 | New pipeline diagram (arch review on the plan before approval; lite post-code pass; fix loop via SendMessage). Update the catalog model column. Add "Hand-off prompt template" and "Main session: token hygiene" sections. | `README.md` | AC-4, AC-8, AC-10 |
| B2 | Add AC-4 ordering to the rule | memory `plan-review-before-implementer.md` | AC-4 |
| B3 | New memory with D8 + D9 rules, plus an index line | memory `main-session-token-hygiene.md`, `MEMORY.md` | AC-8 |
| B4 | Index line for spec 09 | `specs/README.md` | — |

Who does the work: the edits are small and markdown-only, so the **main session
applies them directly**. An implementer run would cost more than the edits
themselves (D8's ≤ 3-line exception does not apply; this is a deliberate one-off,
recorded here).

## 10. Risks & gotchas

- **R1 — sonnet verifier misses subtler gaps.** Mitigation: effort stays `high`, the "claim to refute" rule stays, and architecture-reviewer (opus) still runs. Measure on the next feature (V6). If the verifier misses something opus caught, revert D5.
- **R2 — report cap hides evidence.** The cap applies to prose; evidence lines and "not verified" lists are exempt from trimming. When the cap and completeness conflict, completeness wins, and the agent adds a `## Truncated` line saying what was cut.
- **R3 — plan-time review misses code-level defects** (e.g. AR-2, a `decodeURIComponent` throw). This is why the post-code lite pass stays (D4), and §10 of each spec must name the sensitive files.
- **R4 — main-session rules are not enforced.** They are working rules in memory and README, with no hook. A hook is out of scope.
- **R5 — trusting research (D3) propagates a researcher error.** Change sites are still verified first-hand. A wrong flow claim surfaces in architecture review of the plan.
- **R6 — `.claude/agents/**` is untracked in git** (`git status`: `?? .claude/agents/`). Edits are not versioned until committed. Commit them with this spec.

## 11. Verification

| # | Check | Expected |
|---|---|---|
| V1 | `grep -n "^model:" .claude/agents/plan-verifier.md` | `model: sonnet` |
| V2 | `grep -n -i "1 500\|1500" .claude/agents/{researcher,architecture-reviewer,plan-verifier}.md` | a cap line in each |
| V3 | `grep -n -i "code map" .claude/agents/planner.md` | present in the §3 skeleton |
| V4 | `grep -n "diff --stat\|owner approv" .claude/agents/implementer.md` | both present |
| V5 | README pipeline block shows architecture-reviewer before `[you approve]` | yes |
| V6 | **Pilot on the next feature:** record `subagent_tokens` per agent from the completion notifications and main-context tokens (`get_usage`), and compare with §1 | subagents ≤ 480k, main ≤ 160k, no check skipped. Record the result in this spec as §13. |

## 12. Open questions

- **Q1** — Is the ≈ 1 500-token cap right, or do you want a different number (e.g. 1 000 for researcher, 2 000 for verifier)? *Default in this plan: 1 500 for all three.*
- **Q2** — Should the repo researcher also be skipped for cross-package features, letting the opus planner do discovery? *Default: no; skip only for single-module work (D12).*
- **Q3** — Is D7 acceptable as worded: the live smoke runs only when you have approved the spend in chat and I pass that into the implementer's prompt?
- **Q4 (follow-up, not this plan)** — Product side: each reviewer agent in a DevDigest run re-sends the same diff. Prompt-caching that shared prefix on OpenRouter could cut review cost. Should this become a separate spec?

## 13. Pilot result — spec 10 (prompt-assembly logging), 2026-09-30

Subagent tokens (from completion notifications). A resumed agent's number is cumulative.

| Agent | Spec 08 | Spec 10 | Note |
|---|---|---|---|
| researcher (repo) | 96 556 | 43 485 | narrow brief + 1 500-token cap |
| researcher (external) | 41 191 | — | not needed |
| planner | 121 775 | 124 452 | includes the owner-edit revision via SendMessage (first pass 100 665) |
| architecture-reviewer (plan) | — | 92 832 | **new check** (D4) |
| implementer | 205 464 | 147 344 | includes the PV-1..3 fix loop via SendMessage |
| architecture-reviewer (code) | 129 300 | 72 297 | lite mode |
| plan-verifier | 136 506 (opus) | 88 581 (sonnet) | also ran V8/V9, which spec 08's verifier could not |
| **Total** | **730 792** | **569 000** | **−22%** |

- **V6 target (≤ 480k) not met overall.** Without the new plan-time architecture review, spec 10 is 476k (−35%).
- **Two confounders:**
  - the features differ in size (spec 08 has 37 steps, spec 10 has 20);
  - spec 10 added a review round of the plan with the owner.
- **Checks gained, not lost:**
  - the design review ran before the code, and its six findings were fixed in the plan instead of in code;
  - the verifier ran the boot checks V8 and V9;
  - no fix loop ran in the main session.
- **D5 (sonnet verifier) looks sound on this run.** It met 10/10 ACs with concrete evidence, audited `buildPromptRecord` by hand, and ran a redaction test of its own. Nothing opus caught in spec 08 has a counterpart it missed here, but one run is not proof. Keep watching.
- **Main context** grew ≈ 96k tokens across specs 09 and 10 together (260k → 356k).
