# Agents

Claude Code **subagents** for this repo. Each file here is one agent: YAML
frontmatter (identity, tools, model) plus a system prompt. Claude delegates to
one by matching the task against the agent's `description`; you can also name it
explicitly (`@planner`, "use the implementer subagent to…").

> **Not to be confused with `docs/agent-prompts/`.** Those are the *review*
> agents that run inside the product — their `system_prompt` lives in the
> `agents` DB table and the files there are the human-readable originals. The
> agents in this folder are Claude Code tooling and never touch the DB.
> Evidence: root [`INSIGHTS.md`](../../INSIGHTS.md) → *Codebase Patterns*, 2026-09-29.

## Catalog

| Agent | Role | Writes? | Model | Budget (`maxTurns`) |
|-------|------|---------|-------|------|
| [researcher](researcher.md) | Finds and verifies — in the repo (flows, decisions, history), or in external sources. Reports with evidence and an explicit list of what it could not find | no | `sonnet` | 40 |
| [investigator](investigator.md) | Read-only structural tracer of the current tree: definitions, importers/callers, consumers of a field, blast radius. No shell, no web | no | `sonnet` | 25 |
| [brainstorm](brainstorm.md) | Generates and weighs 3–5 options before any plan exists, rubric first; the human chooses | no | `opus` | 30 |
| [planner](planner.md) | Turns a request into a Development Plan in the house spec format | plan file only | `opus` | 80 |
| [implementer](implementer.md) | Executes an approved plan across `server/` and `client/`, runs the tests, reports | source code | `sonnet` | 150 |
| [test-writer](test-writer.md) | Writes a test for a named behaviour, edge case or bug in `client/`, `server/` or `reviewer-core/`; never changes production code | tests only | `sonnet` | 60 |
| [architecture-reviewer](architecture-reviewer.md) | Read-only architectural verdict against the onion rings and frontend layout, on a plan, a working tree or a file list. Not the PR gate | no | `opus` | 35 |
| [plan-verifier](plan-verifier.md) | Checks finished code against a plan's acceptance criteria point by point, runs the plan's verification, never fixes | no | `sonnet` | 50 |
| [doc-writer](doc-writer.md) | Documents an implemented feature with a Mermaid diagram, filed under the right `docs/` or README and linked from `AGENTS.md` | docs only | `sonnet` | 50 |
| [insight-curator](insight-curator.md) | Read-only audit of all five `INSIGHTS.md` files: duplicates, contradictions, stale evidence, promotions. Proposals only | no | `opus` | 40 |

Every agent has a `maxTurns` cap and a matching "reserve" rule in its prompt; see
*What the configuration does and does not guarantee*.

## The pipeline

```
 design question ──► brainstorm ──► options ──► [you choose] ─┐
                                                              ▼
 request ──► researcher(s) / investigator ──► planner ──► specs/NN + ≤40-line summary
                                              │
                                              ▼
                        architecture-reviewer (on the PLAN)
                                              │
                                              ▼
            [you read the spec file + review, give edits, approve]
                                              │
                                              ▼
                   implementer ──► code + tests + manifest (diff stat, AC→test)
                        ▲         (+ live smoke only if you approved the spend)
                        │                     │
      fix list via      │                     ▼
      SendMessage ──────┴── plan-verifier (sonnet) ‖ architecture-reviewer (lite:
                            from the manifest       §10-sensitive files only)
                            · security (specs/07) · test-writer · doc-writer, as before
                                              │
                                              ▼
                     main session: live run in the app ──► short summary to you
                                              │
      engineering-insights wrap-up ──► <pkg>/INSIGHTS.md  +  ledger.sh record ──► ledger.tsv
                                                                │ ledger.sh status = due (>=10 tasks)
             insight-curator ──► proposals ──► [you pick] ──► edits ──► main session: ledger.sh curated
```

Order and cost rules come from [spec 09](../../specs/09-cheaper-agent-pipeline.md):
- the architecture review of the **plan** happens before approval;
- review fixes go back to the **same** implementer through `SendMessage`, and the main session edits code only for fixes of ≤ 3 lines;
- the repo researcher is skipped for single-module features, where the planner does that discovery.

`researcher` (questions about flows, decisions, history and external behaviour)
sits beside this flow: its report is a message, pasted into a prompt the same
way.

**Only the main session delegates.** Claude Code lets a subagent spawn subagents
(up to three layers below the main conversation) *when it has the `Agent` tool*
— the tool was renamed from `Task` in v2.1.63 and `Task` is still an alias.
No agent here lists `Agent` in `tools`, so none can delegate; every hand-off
between agents is the main session pasting one report into the next prompt (root
[`INSIGHTS.md`](../../INSIGHTS.md), 2026-09-29). Nesting is allowed by the
platform; it is switched off here by the `tools` allowlists.

`pr-self-review` (a skill, not an agent) remains the PR gate: branch diff,
Tier-1 checks, stamp. `architecture-reviewer` does not replace it. A parallel
`brainstorm` run is real Best-of-N at roughly 15x the tokens; a verification
subagent is a second opinion, whereas a hook is a deterministic gate. The
`plan-verifier` summary block and the ledger are the two deterministic pieces in
this pipeline.

Each subagent starts with a **fresh context** and cannot see this conversation,
so every hand-off is an artifact: the plan is a file, the report is structured
text. Nothing is passed "in memory".

### Hand-off prompt template (spec 09, D10)

Parallel agents that review the same change get an **identical opening block**,
so the shared prefix is cache-friendly. Their agent-specific task comes last:

~~~
Spec: specs/NN-slug.md — start from its §3 code map.
Implementer manifest (verbatim): <diff stat + AC→test table>
Owner decisions: <§12 resolutions, one line each>
Exclude server/clones/** and .claude/worktrees/**.
---
<agent-specific task>
~~~

### Main session: token hygiene (spec 09, D9)

The main session's context is re-read on every turn, so what enters it stays expensive:
- **Plans.** Read the planner's ≤ 40-line summary, not the whole spec. Show the owner the spec *file*.
- **Screenshots.** Use `scale: 0.5` unless a detail needs full size.
- **`preview_logs`.** Always pass `search`, with `lines` ≤ 20.
- **Commands.** Filter test and build output to summary lines (`grep -E "Tests |FAIL"`).
- **Files.** Use `grep -n` / `sed -n a,b` ranges rather than whole-file reads.
- **Agent reports.** They are capped at ≈ 1 500 tokens (D1). Relay the gist to the owner; do not re-paste them.

---

## researcher

**Responsibility.** Two modes, each with its own report format: **R** — repo
research (where something lives, how a flow works, what was already decided);
**E** — external research (library behaviour, releases, issues, standards).
Verifies; never concludes from a search-result snippet.

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, Bash, WebSearch, WebFetch, TodoWrite` — no `Write`, no `Edit` |
| **Model** | `sonnet` |
| **Input** | A concrete question. Without one it asks up to 4 clarifying questions and researches nothing |
| **Output** | A report in the final message — `Answer` + confidence, numbered findings with `path:line` or `[S1]` citations, a source table for mode E, **`Not found / unverified`**, `Scope & limits` |

Two standing constraints: it must never run `/deep-research`, and it must
exclude `server/clones/**` and `.claude/worktrees/**` from every search.

**Amended by spec 06.** Its `description` no longer claims structural questions
("where is X implemented", "is Z used anywhere", "which files would a change
touch"): those are `investigator`'s, so delegation does not become a coin toss.
It keeps flows, decisions, git history and external behaviour. **Budget:**
`maxTurns: 40`, reserve 4.

---

## planner

**Responsibility.** Research, then **one** document: a plan another agent can
execute without re-deriving anything. It decides *what*; the project skills
decide *how*. It writes no code.

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, Bash, Write, TodoWrite, Skill` — `Write` is scoped by instruction to `specs/` only; **no `Edit`**, so it cannot modify an existing source file at all |
| **Preloaded skill** | `onion-architecture` — loaded in full at startup, because ring boundaries constrain the *shape* of the plan, not just the code |
| **Model** | `opus` |
| **Input** | A feature request with a user-visible outcome. Otherwise it asks first and plans nothing |
| **Output** | `specs/NN-slug.md` (root for ≥2 packages, `<pkg>/specs/` for one). Final message = path + phase/step count + open questions + diagram list + the riskiest tripwire |

**Plan skeleton** (§ numbers as written): Summary + Out of scope → **How it works (Mermaid diagrams — mandatory: flow/sequence + structure)** → Decisions
table → *What already exists — do not rebuild* → Data model → Contracts →
Server → Client → EARS acceptance criteria → phased plan → Risks → Verification
→ Open questions. See [planner.md:164](planner.md:164).

**Why the plan can't contradict implementation rules.** Every step in §9 carries
the project skill the implementer will apply to it ([planner.md:100](planner.md:100)),
and `onion-architecture` is already in the planner's context — so a step that
puts Drizzle in a `service.ts` is caught while planning, not in review.

**Budget:** `maxTurns: 80`, reserve 8 — in the reserve it writes the plan with
what is known and lists the rest under Open questions.

---

## implementer

**Responsibility.** Execute the plan, phase by phase. The narrowest scope of the
three: the plan decides what, the skills decide how, and it decides nothing the
plan already decided.

| | |
|---|---|
| **Tools** | `Read, Edit, Write, Bash, Grep, Glob, TodoWrite, Skill` |
| **Denied** | `disallowedTools: WebSearch, WebFetch` — a denylist, applied before `tools` resolve. Research is the researcher's job |
| **Model** | `sonnet` |
| **Input** | Path to an approved `specs/NN-slug.md`. If a first-phase dependency sits in the plan's *Open questions*, or a cited path is missing, it stops and asks |
| **Output** | Working code + an Implementation Report: AC status table, changes, skills applied, verification with **verbatim** command output, deviations, blocked items, **For review**, insight recorded. See [implementer.md:193](implementer.md:193) |

**Boundaries.** No architecture review, no security audit, no `pr-self-review`,
no commit, no PR ([implementer.md:31](implementer.md:31)). Instead the report's
**For review** section hands the next agents exactly what to look at — new
boundaries, new routes and their auth, new external I/O, wherever user input
reaches a query or a prompt.

**Ends with** `engineering-insights`, per root [`AGENTS.md`](../../AGENTS.md)
("Do not skip this step") — the entry ships with the change it documents. Its
`## Insight recorded` section also carries the ledger status line, verbatim, so
the "curation due" signal reaches the main session.

**Budget:** `maxTurns: 150`, reserve 10 — in the reserve it finishes the current
step, never starts a new phase, and reports the last checkpoint that passed.

---

## test-writer

**Responsibility.** Write the test for a stated behaviour: a named edge case, a
bug reproduced as a failing test first, or the happy path of an untested file.
It reads a neighbouring test, routes to the per-layer skill, reuses the repo's
helpers and mocks, runs what it wrote, and reports honestly — including when a
suite *skipped*.

| | |
|---|---|
| **Tools** | `Read, Edit, Write, Bash, Grep, Glob, TodoWrite, Skill` |
| **Denied** | `disallowedTools: WebSearch, WebFetch` |
| **Model** | `sonnet` (`effort: high`) |
| **Input** | A target **plus** the behaviour to pin. A bare "add tests for `foo.ts`" makes it ask first |
| **Output** | A Test Report: what is now pinned, run table with verbatim tails, seams used, not covered, **For the code owner** |

**Boundaries.** Never modifies production code and never removes, skips or
weakens an existing test. Overlap with `implementer`: `implementer` writes the
tests of the plan it is executing; `test-writer` is for back-filling, a named
edge case, or a bug reproduction. It states that client tests mock `lib/hooks/*`,
not `fetch`.

**Budget:** `maxTurns: 60`, reserve 6.

---

## architecture-reviewer

**Responsibility.** An architectural verdict with quoted evidence — ring
direction, Drizzle only in repositories, external I/O only through a container
port, Zod at the rim, orchestration in `service.ts` — on a plan, a
mid-implementation working tree, or a named file list.

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, TodoWrite, Skill` — no write tool and **no `Bash`** |
| **Denied** | `disallowedTools: Write, Edit, NotebookEdit, Bash, WebSearch, WebFetch` — listed even though absent from `tools`, so a careless later edit to the allowlist still cannot add them |
| **Preloaded skill** | `onion-architecture` |
| **Model** | `opus` (`effort: high`) |
| **Input** | A path list, a module, a plan path, or pasted diff text; optionally the change's intent in one sentence |
| **Output** | An Architecture Verdict: `approve` / `request_changes` / `comment`, findings `AR-n` with `CRITICAL \| WARNING \| SUGGESTION`, **Checked and clean**, **Pre-existing**, **Not verified** |

**Overlap with `pr-self-review`.** The skill is the PR gate: branch diff, Tier-1
gates, slice fan-out (its backend slice already loads `onion-architecture`),
adversarial CRITICAL verification, stamp. This agent is the one thing the gate
is not: a verdict not gated on a branch diff — usable before a PR-shaped diff
exists, and on plans and docs, which the gate excludes
(`.claude/skills/pr-self-review/routing.md:14-15,50`). It writes no stamp. The
same file may be judged twice; that is expected. It does not report the known
pre-existing deviations (`pulls/routes.ts`, `polling`, `workspace`, `settings`)
unless the change worsens them. With no `Bash` it cannot run `git diff`; the
caller pastes history into the prompt.

**Budget:** `maxTurns: 35`, reserve 4.

---

## plan-verifier

**Responsibility.** A fresh model trying to refute "the plan is done": every
acceptance criterion, every implementation step, every out-of-scope boundary,
each Met / Not met / Unverifiable with evidence, plus the plan's verification
commands run for real.

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, Bash, TodoWrite` — no `Skill`: its criteria come from the plan |
| **Denied** | `disallowedTools: Write, Edit, NotebookEdit, WebSearch, WebFetch` — it can prove a failure but cannot paper over one |
| **Model** | `sonnet` (`effort: high`) — moved from `opus` by spec 09 D5: AC matching is mechanical; revert if a pilot shows it missing what opus caught |
| **Input** | A plan path (required) and the state to check (working tree by default). An Implementation Report, if given, is a claim to refute — and its per-AC test column + diff stat is the map it starts from (spec 09 D6) |
| **Output** | A Plan Verification Report: one table row per AC in plan order, step table, out-of-scope check, verification run, findings `PV-n`, **Plan defects** |

**Reads legacy specs.** Specs `01`–`04` predate the planner skeleton: it finds
ACs by scanning for `**AC-<n>` rather than by section, qualifies repeated ids
(`specs/03-skills.md` has two AC blocks), compares step tables by symbol not line
number, and derives its commands (saying so) when there is no §11. Generic
best-practice advice is never a substitute for the AC-by-AC check.

**Amended by spec 06.** Three additions, so the report can say what is *missing*
and become parseable: a closed `## Unplanned gaps` checklist (T1, T2, T4, T5,
T6 over the touched files; at most 5 rows, at most `WARNING`, never changes the
verdict); a `Kind` column (`cmd | test | read | none`) on the AC table; and a
final `## Summary (machine-readable)` JSON block (`plan-verifier/v1`) that a
future deterministic gate (root [`README.md`](../../README.md) L06 row) recomputes
rather than trusts — a gate is code, not a second model
([`specs/04-conventions.md`](../../specs/04-conventions.md):35). The verdict rule
is unchanged. **Budget:** `maxTurns: 50`, reserve 5.

---

## doc-writer

**Responsibility.** Document what is implemented — from a plan, a report or the
code — with a Mermaid diagram, in the right place, with the `AGENTS.md` **Read
when** link added in the same change.

| | |
|---|---|
| **Tools** | `Read, Write, Edit, Bash, Grep, Glob, TodoWrite, Skill` — `Bash` read-only by prompt |
| **Denied** | `disallowedTools: WebSearch, WebFetch` |
| **Preloaded skill** | `mermaid-diagram` |
| **Model** | `sonnet` |
| **Input** | A plan path, a pasted report, or a feature name, plus the audience. An unimplemented feature stops it at the gate |
| **Output** | A Documentation Report: files written and why there, the diagram, claims grounded in `path:line`, **Not documented**, **Stale docs found** |

**Boundaries.** Never writes to `docs/agent-prompts/` or `docs/skills/` (product
artifacts mirrored into the DB and `seed-skills.ts`), `.claude/skills/`,
`.claude/agents/`, `specs/`, or an `INSIGHTS.md` (it invokes
`engineering-insights` instead). Its `## Insight recorded` section also carries
the ledger status line, verbatim.

**Budget:** `maxTurns: 50`, reserve 5.

---

## investigator

**Responsibility.** A structural tracer of the *current working tree*: where a
symbol is defined, who imports or calls it, the chain from A to B, every consumer
of a contract field, the blast radius of a named change. It returns an edge
table, not an explanation. It knows that `@devdigest/shared` resolves to two
different vendored trees (`server/src/vendor/shared/` from `server/` and
`reviewer-core/`, `client/src/vendor/shared/` from `client/`) and searches both
casings.

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, TodoWrite` — no `Bash`, no write tool, no web |
| **Denied** | `disallowedTools: Write, Edit, NotebookEdit, Bash, WebSearch, WebFetch` |
| **Model** | `sonnet` (`effort: high`) |
| **Budget** | `maxTurns: 25`, reserve 3 |
| **Input** | One concrete structural question, or a concretely stated change. A *why* question is redirected to `researcher` |
| **Output** | A Trace Report: Answer, Definitions, **Edges** (each with `path:line`, inferred edges marked), Blast radius, Drift noticed, **Not searched** |

**Boundaries.** No history, no explanation, no recommendation, no ring verdict.
The main session fans it out and pastes the report into `planner`,
`implementer`, `brainstorm` or `architecture-reviewer`.

---

## brainstorm

**Responsibility.** Generate and weigh options *before* a plan exists — a
Best-of-N step for a design question. A fixed protocol counters model-as-judge
bias: a rubric with weights written before any option; 3–5 options that differ in
mechanism, option A always "reuse what exists / do nothing"; a check against ideas
already rejected in `INSIGHTS.md` and spec Decisions tables; a capped card with a
mandatory strongest objection; absolute scores in **reverse** generation order;
a recommendation, runner-up and flip condition. **The human chooses.**

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, TodoWrite, Skill` — `Skill` only to load a ring skill on demand |
| **Denied** | `disallowedTools: Write, Edit, NotebookEdit, Bash, WebSearch, WebFetch` |
| **Model** | `opus` (`effort: high`) |
| **Budget** | `maxTurns: 30`, reserve 3 |
| **Input** | A design question with the wanted outcome; optional constraints, rubric, option count (3–5) |
| **Output** | An Options Report ending in a *Hand-off to planner* block the main session pastes into `planner` after the human picks |

**Limit, stated in the prompt.** Options from one context are correlated and
self-scored; a real Best-of-N is the main session running 2–3 instances in
parallel, at roughly 15x the tokens. It writes no file — `planner` stays the sole
spec writer.

---

## insight-curator

**Responsibility.** The periodic human-reviewed pass over all five `INSIGHTS.md`
files that `engineering-insights` leaves undone: cross-file duplicates,
contradictions, stale evidence (paths resolved relative to the INSIGHTS file's own
directory first), misfiled entries, bloat, and rules mature enough to promote.
Every proposal is append-only (a nested dated correction or a *promoted* note).

| | |
|---|---|
| **Tools** | `Read, Grep, Glob, TodoWrite` |
| **Denied** | `disallowedTools: Write, Edit, NotebookEdit, Bash, WebSearch, WebFetch` |
| **Preloaded skill** | `engineering-insights` — as a *reference* for routing, quality bar and guardrails; its Record steps and the ledger are not the curator's job |
| **Model** | `opus` (`effort: high`) |
| **Budget** | `maxTurns: 40`, reserve 4 |
| **Input** | Usually none: scope is entries dated on or after the last `curated` marker in `.claude/insight-curator/ledger.tsv`, plus a cross-file sweep |
| **Output** | A Curation Report: inventory, proposals table (at most 20 rows), unverifiable evidence, checked and clean, *For the main session* |

**The ledger loop.** `engineering-insights` step 8 runs
`scripts/ledger.sh record` at every wrap-up; `ledger.sh status` says "curation
due" once the count of tasks since the last marker reaches the script's
`THRESHOLD` (10). The curator never writes the marker (no `Bash`, no write tool):
after the human acts on the proposals, the **main session** runs
`.claude/skills/engineering-insights/scripts/ledger.sh curated`.

**Known limit.** The ledger uses `merge=union`, which can land appended lines in
random order (git-scm, gitattributes). `status` therefore counts `task` lines
dated after the latest `curated` date, plus same-day lines below the last marker
of that date, rather than trusting line order; near a merge it can still be off
by a few tasks, which is acceptable for a "~10 tasks" trigger.

---

## Sources behind the agent rules

The prompts are grounded, not invented. Two families:

### Official Claude Code documentation

| Rule | Where in the agents |
|---|---|
| Omitting `tools` makes a subagent inherit **every** available tool — least privilege needs an explicit list | [planner.md:14](planner.md:14), [implementer.md:13](implementer.md:13) |
| `disallowedTools` is a denylist resolved *before* `tools` | [implementer.md:14](implementer.md:14) |
| Delegation is driven solely by `description`; it must single out one agent | the `description` blocks of both files |
| A subagent gets a fresh context window and returns only a summary | file-based hand-off: [planner.md:251](planner.md:251) → [implementer.md:83](implementer.md:83) |
| One subagent, one job; restrict tools for focus as well as safety | [implementer.md:31](implementer.md:31) (no review), planner has no `Edit` |
| `skills:` preloads the **full** skill body at startup, not just its description | [planner.md:16](planner.md:16) — one skill, deliberately |
| *Explore → plan → code → commit*: separate planning from implementation | the planner/implementer split itself |
| Spec hand-off: a finished spec is executed by a fresh context | [planner.md:164](planner.md:164) — output is a file |
| A good spec names the files involved, states what is out of scope, ends with an end-to-end check | [planner.md:178](planner.md:178), [planner.md:228](planner.md:228) |
| Plan mode has real overhead — skip it for a one-sentence diff | [planner.md:240](planner.md:240) |
| Review belongs in a separate, fresh context that sees the diff, not the author's reasoning | [implementer.md:232](implementer.md:232) — **For review** |
| `permissionMode` is ignored when the parent runs in `bypassPermissions`, `acceptEdits` or `auto`, and even when honoured only gates by prompting — the `tools` allowlist is the hard restriction (a tool left out "isn't in the subagent's session at all" — that quote is **unverified** against the primary page) | [architecture-reviewer.md](architecture-reviewer.md) — Role; no agent here sets `permissionMode` |
| `memory:` force-enables Read, Write and Edit so the agent can manage its memory files | no agent here sets `memory` (incompatible with read-only) |
| A `Bash` grant weakens a read-only claim: Read/Edit deny rules do not cover subprocesses that write indirectly | [architecture-reviewer.md](architecture-reviewer.md) — no `Bash`; the guarantees section below |
| Adversarial review: a reviewer sees the target and criteria, not the author's reasoning. Caveat: an agent prompted to find gaps reports some even when the work is sound, which drives over-engineering — flag only gaps affecting correctness or stated requirements | [architecture-reviewer.md](architecture-reviewer.md) — Severity; [plan-verifier.md](plan-verifier.md) |
| Verification pattern: a fresh model shows the command run and its output rather than asserting success; the named gap is trust-then-verify | [plan-verifier.md](plan-verifier.md) — Role |
| `effort` takes `low\|medium\|high\|xhigh\|max`; `high` suits work where verification matters, `max` is prone to overthinking. There is no documented per-role mapping — `high` on three agents is a judgement call | frontmatter of `test-writer`, `architecture-reviewer`, `plan-verifier` |
| The prompt string is the only parent → subagent channel: no conversation history, no earlier tool results | [architecture-reviewer.md](architecture-reviewer.md) — Hard rule 2 |
| Documentation practice: identify what is undocumented, match the project's documentation standards, and check neighbours because a code change can make an existing doc stale. Diagram practice is **not** official guidance — it is attributed to this repo's `mermaid-diagram` skill and in-repo usage | [doc-writer.md](doc-writer.md) — Role, Diagrams; `skills: mermaid-diagram` preloaded in full |
| Tests: cover a named edge case, avoid mocks, reproduce a bug as a failing test first, read existing tests to match style (Anthropic engineering post, 2025-11-26 — **not** the CLI docs; the same post calls editing a test to pass unacceptable) | [test-writer.md](test-writer.md) — Hard rules, Philosophy |

Primary sources: `code.claude.com/docs/en/sub-agents`, `…/skills`,
`…/features-overview`, `…/best-practices`, `…/common-workflows`.

### Numbered sources (spec 06)

Verified on 2026-09-29 against the primary pages unless marked otherwise.

| # | Source | Used here for |
|---|---|---|
| S1 | [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | Frontmatter keys; `tools` allowlist; `description`-driven delegation; `maxTurns`: "Maximum number of agentic turns before the subagent stops. When the subagent reaches the limit, Claude Code returns its output marked as partial, and Claude can resume it to continue" (the partial marking needs Claude Code v2.1.246 or later; installed is 2.1.284). **Not defined in the docs: what counts as a "turn".** Subagents can spawn subagents, up to three layers below the main conversation, when they have the `Agent` tool; `Task` was renamed `Agent` in v2.1.63 and remains an alias |
| S2 | [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | Subagents for investigation; adversarial review; gap-finding over-reports; a hook is a deterministic gate, a verification subagent is a second opinion |
| S3 | [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Parallelisation and voting (why parallel `brainstorm`), orchestrator-workers, start simple |
| S4 | [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Condensed reports upward; delegation = objective + output format + tools + boundaries; roughly 15x token cost |
| S5 | [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Sub-agent isolation with distilled summaries. The "minimal preloads" wording is **unverified** |
| S6 | [Anthropic — Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Token-efficient, high-signal tool outputs. The "narrow tools" wording is **unverified** |

### Research literature (spec 06)

| # | Source | Used here for |
|---|---|---|
| S7 | Wang et al., [arXiv:2203.11171](https://arxiv.org/abs/2203.11171) | Self-consistency needs independent samples — why one-context options are only an approximation |
| S8 | Yao et al., [arXiv:2305.10601](https://arxiv.org/abs/2305.10601) | Distinct branches and explicit evaluation (`brainstorm` protocol) |
| S9 | Zheng et al., [arXiv:2306.05685](https://arxiv.org/abs/2306.05685) | Position, verbosity and self-enhancement biases of model judges (`brainstorm` protocol) |
| S10 | Git — [gitattributes, "Built-in merge drivers"](https://git-scm.com/docs/gitattributes) | `merge=union` is built in and needs no config; added lines can land "in random order" — the ledger's known limit |

### This repo's own curated docs

| Rule | Source | Where in the agents |
|---|---|---|
| Read `specs/` → `docs/` → `INSIGHTS.md` → source, and cite what answered you | root [`AGENTS.md`](../../AGENTS.md) | [planner.md:76](planner.md:76), [implementer.md:83](implementer.md:83) |
| Record insights at the end of a non-trivial task | root `AGENTS.md` | [implementer.md:95](implementer.md:95) |
| House spec format: `NN-slug.md`, Decisions table, "do not rebuild" table, EARS criteria | [`specs/README.md`](../../specs/README.md), [`specs/04-conventions.md`](../../specs/04-conventions.md) | [planner.md:164](planner.md:164) |
| This repo ships pre-staged scaffolding with no module behind it — grep before planning to create | root [`INSIGHTS.md`](../../INSIGHTS.md) → Codebase Patterns, 2026-08-05 | [planner.md:91](planner.md:91) |
| Nine cross-cutting tripwires (two `vendor/shared` trees, snake/camel, per-enum casing, generated migrations, auth on new routes, …) | root `AGENTS.md`, [`pr-self-review/references/repo-tripwires.md`](../skills/pr-self-review/references/repo-tripwires.md) | [planner.md:138](planner.md:138), [implementer.md:122](implementer.md:122) |
| `pnpm typecheck` / `install` / `db:migrate` abort on `ERR_PNPM_IGNORED_BUILDS` — use the direct binaries | root `AGENTS.md`, [`server/INSIGHTS.md`](../../server/INSIGHTS.md) | [planner.md:154](planner.md:154), [implementer.md:166](implementer.md:166) |
| Inward-only dependencies; Drizzle only in repositories; external I/O only through a container port | [`onion-architecture`](../skills/onion-architecture/SKILL.md) | [planner.md:124](planner.md:124), [implementer.md:150](implementer.md:150) |
| `arch:check` and dependency-cruiser **do not exist** — nothing catches a boundary violation mechanically | `server/INSIGHTS.md` → Tool & Library Notes, 2026-09-21 | [planner.md:42](planner.md:42), [implementer.md:155](implementer.md:155) |
| `*.it.test.ts` are DB-backed and run serially; everything else stays hermetic | [`TESTING.md`](../../TESTING.md) | [implementer.md:186](implementer.md:186) |
| Required contract fields break every literal incl. fixtures · `drizzle-kit generate` hangs on drop+add · `void done.catch()` · `next build` corrupts a live `.next/` | `server/INSIGHTS.md`, `client/INSIGHTS.md` | [implementer.md:136](implementer.md:136) |
| Skill routing per layer; `pr-self-review` is a PR gate, not an implementation step | [`.claude/skills/README.md`](../skills/README.md) | [planner.md:100](planner.md:100), [implementer.md:100](implementer.md:100), [test-writer.md](test-writer.md) |
| House severity vocabulary is exactly `CRITICAL \| WARNING \| SUGGESTION` | [`docs/agent-prompts/README.md:79-81`](../../docs/agent-prompts/README.md) | [architecture-reviewer.md](architecture-reviewer.md), [plan-verifier.md](plan-verifier.md) — keep in step if the scale ever changes |
| Anti-inflation: speculative ⇒ at most WARNING; drop a likely false positive; state the mechanism; only what this change introduced | [`docs/agent-prompts/general-reviewer.md:42-47,61-63,73`](../../docs/agent-prompts/general-reviewer.md) | same two files |
| `pr-self-review` scope and caps (4 agents, 40 findings per slice; excludes `**/*.md`, `docs/**`, `specs/**`) | [`routing.md:14-15,50`](../skills/pr-self-review/routing.md) | [architecture-reviewer.md](architecture-reviewer.md) — What you are not |
| The test map, helpers, mocks and gotchas (`*.it.test.ts` serial, self-skip without Docker) | [`TESTING.md`](../../TESTING.md), `server/INSIGHTS.md:48` | [test-writer.md](test-writer.md) |
| Docs routing: `docs/agent-prompts/` and `docs/skills/` are mirrored product artifacts; per-package `docs/` are stubs with a link rule | `docs/agent-prompts/README.md:18-20`, `docs/skills/README.md:3-8`, `client/docs/README.md:3-4` | [doc-writer.md](doc-writer.md) — routing table |
| Curator promotion targets are a closed list; never `docs/agent-prompts/**` or `docs/skills/**` | `docs/agent-prompts/README.md:18-20`, `docs/skills/README.md:3-8`, `client/docs/README.md:3-4` | [insight-curator.md](insight-curator.md) — Hard rules |
| `.claude/worktrees/**` is a stale full copy of the repo; a default `rg` skips it because `.claude` is a **hidden** directory (not because of `.git/info/exclude`); `rg --no-ignore` still hides it, only `--hidden --no-ignore` exposes it; `find`, `ls` and `Read` by path do not skip it; whether the harness `Grep`/`Glob` skip it is unverified — so every agent excludes it as defence in depth | `.git/info/exclude:7`, root [`AGENTS.md`](../../AGENTS.md) → Do not touch | every agent file |
| Curation cadence: a tracked append-only ledger counts wrap-ups; `THRESHOLD` lives once in the script | [`engineering-insights/scripts/ledger.sh`](../skills/engineering-insights/scripts/ledger.sh), `.claude/insight-curator/ledger.tsv`, `.gitattributes` | [insight-curator.md](insight-curator.md), `implementer.md` and `doc-writer.md` (`## Insight recorded`) |
| A gate is code, not a second model; L06 is the Plan Verifier | [`specs/04-conventions.md`](../../specs/04-conventions.md):35, root [`README.md`](../../README.md):87 | [plan-verifier.md](plan-verifier.md) — Summary block |
| `@devdigest/shared` resolves to two trees through tsconfig `paths` | `server/tsconfig.json:21-26`, `client/tsconfig.json:22-28`, `reviewer-core/tsconfig.json:21-26` | [investigator.md](investigator.md) — How this repo resolves imports |
| Specs `01`–`04` are not uniform (AC blocks at §6/§8/§9, repeated ids, Ukrainian design tags, no §11 or step table) | [`specs/`](../../specs/README.md) | [plan-verifier.md](plan-verifier.md) — Reading the plan |

---

## What the configuration does and does not guarantee

**Enforced by the harness**: the `tools` allowlist and `disallowedTools`. The
planner genuinely cannot call `Edit`; the implementer genuinely cannot reach the
web; `architecture-reviewer` genuinely cannot write or run a shell command.

**`permissionMode` is not a reliable read-only mechanism for a subagent.** It is
ignored when the parent session runs in `bypassPermissions`, `acceptEdits` or
`auto` (the default interactive mode), and even when honoured it only prompts
before an edit. No agent here sets it, and none sets `memory:` (which
force-enables Read/Write/Edit). Do not add either to "harden" an agent.

**Four agents are harness-enforced read-only** — `architecture-reviewer`,
`brainstorm`, `investigator` and `insight-curator` — because none has `Bash` or a
write tool, and each names them in `disallowedTools`. None lists `Agent` in
`tools`, so none can delegate (an allowlist that omits it is enough; the tool is
`Agent`, formerly `Task`). **Six agents hold `Bash`** — `researcher`, `planner`,
`implementer`, `test-writer`, `plan-verifier`, `doc-writer` — so their
restrictions are prompt-only.

**`maxTurns` bounds every agent** (values in the catalog). What the docs say:
at the limit Claude Code returns the output marked as partial and the caller can
resume the subagent (partial marking needs v2.1.246 or later; installed is
2.1.284). What the docs do **not** say is what counts as a "turn" — a model
round, a tool call, or a batch of parallel calls. **Observed 2026-09-30 (spec 06
E2 probe, `maxTurns: 3` copy of `investigator`):** a turn is one *model round* —
the probe made **15 tool calls in 3 turns** by batching parallel `Grep`/`Read`.
At the cap the harness told the caller "stopped at its 3-turn limit… had produced
no report", yet the hand-back still carried a full, usable trace; the agent
never reached its `## Not finished` section and instead admitted the cut under
"Not searched (turn budget)". Decision (E3): keep the catalog values — they are
generous, since one turn can hold many calls — and treat a partial-marked
result as usable but incomplete; resume the agent with `SendMessage` to finish.
The "reserve" rule in each prompt ("when fewer than R
turns remain, stop and report, with `## Not finished / budget exhausted`") is
prompt-level and approximate: the model may not see a turn counter, so it counts
its own tool rounds through `TodoWrite`. An agent that hits `Not finished` on
ordinary work is a signal to raise its row, not to remove the cap.

**Enforced only by the prompt**: read-only `Bash` in the planner, the researcher
and the doc-writer; "no `git commit`"; "don't refactor outside the plan";
"`Write` only under `specs/`"; the plan-verifier's "run only the plan's own
commands". `Bash` has no allow-`rg`-deny-`sed -i` switch — an agent with `Bash`
can write through the shell. If you want a hard guarantee, it belongs in
`permissions.deny` in `settings.json`, not in an agent file.

## Adding or editing an agent

Frontmatter keys must match the official set exactly, in camelCase: `name`,
`description`, `tools`, `disallowedTools`, `model`, `permissionMode`,
`maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`,
`omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`, `experimental`.
There is **no** `disable-model-invocation` for a subagent — that key belongs to
`SKILL.md`.

**An unrecognised key is ignored silently**, so a typo does not fail loudly —
it quietly over-privileges the agent. Verify after every edit:

```bash
node -e "const fs=require('fs');const K=['name','description','tools','disallowedTools','model','permissionMode','maxTurns','skills','mcpServers','hooks','memory','background','omitClaudeMd','effort','isolation','color','initialPrompt','experimental'];for(const f of fs.readdirSync('.claude/agents').filter(f=>f.endsWith('.md')&&f!=='README.md')){const m=fs.readFileSync('.claude/agents/'+f,'utf8').match(/^---\n([\s\S]*?)\n---\n/);if(!m){console.log(f,'NO FRONTMATTER');continue;}const bad=m[1].split('\n').filter(l=>/^[A-Za-z][\w-]*:/.test(l)).map(l=>l.split(':')[0]).filter(k=>!K.includes(k));console.log(f,bad.length?'UNKNOWN KEYS: '+bad:'ok')}"
```

Every new agent must: set `maxTurns` in the frontmatter; state the same number in
the body with a reserve rule and a `Not finished / budget exhausted` section in
its output template (the same number in both places — check them together); and
exclude `server/clones/**` **and** `.claude/worktrees/**` from its searches.

Two drafting notes worth keeping: all `description` fields share a 15,000-token
budget, so keep them tight; and a report template inside an agent prompt must be
fenced with `~~~` if it contains an indented ``` fence, or the outer fence closes
early.
