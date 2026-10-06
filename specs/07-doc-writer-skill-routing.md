# 07 — `doc-writer`: skill routing, Diátaxis classification, and two skill corrections

> Status: **draft** (2026-09-29). Scope: `.claude/agents/` only — repo-wide tooling, no package.
> EARS acceptance criteria in §8.

> **`06` is deliberately skipped.** It is reserved for a security-reviewer plan
> already queued in another session. Do not re-use `06`; the next free prefix
> after this file is `08`.

## 1. Summary

`doc-writer` grants the `Skill` tool (`.claude/agents/doc-writer.md:12`) and
preloads `mermaid-diagram` (`:15`), but **nothing in the prompt ever tells it to
call `Skill`** beyond three incidental mentions: Hard rule 5 (`:37`), the
`INSIGHTS.md` row of the routing table (`:74`), and Procedure step 5 (`:112`) —
all three about `engineering-insights`. The strings "Skill tool" and "invoke the
skill" appear nowhere in the file (verified: `rg -n 'Skill tool|invoke the skill'
.claude/agents/doc-writer.md` returns nothing). It is the only production agent
with `Skill` and **no skill-routing section**: `implementer.md:100-120` has
`# Skills — apply by what the step touches` and `test-writer.md:71-83` has
`# Skill routing`, each with a one-sentence when-to-invoke rule, a two-column
table keyed by what is being touched, and a "Not yours" line
(`implementer.md:119-120`). Three further gaps follow from the same root cause:
the `## Insight recorded` output row (`:142-143`) rests on one unconditional
Procedure line with no trigger and none of the "let it decide whether anything
clears its bar" wording that `implementer.md:95-98` uses; there is **no recall
step**, so the agent never reads the target module's `INSIGHTS.md` before
writing, which is half of what the skill is for
(`.claude/skills/engineering-insights/SKILL.md:21-24`); and there is no
`## Skills applied` output row, which is the thing that makes skill use auditable
(`implementer.md:211-214`).

This plan fixes that by adding one routing section, two corrections, a Diátaxis
classification step, and two output rows — not by preloading more skills.

**Where this disagrees with the "preload five skills" proposal.** The defect is
an *instruction* gap, not a *context* gap. `doc-writer` already has the `Skill`
tool, and the official docs state `skills:` controls which skills are
**preloaded, not which the subagent can access** — a non-preloaded skill is
still reachable through `Skill`. Preloading five would inject ≈52,540 B / ~13k
tokens (measured: `mermaid-diagram` 7,201 · `typescript-expert` 14,791 ·
`onion-architecture` 7,720 · `frontend-ui-architecture` 14,679 ·
`engineering-insights` 8,149) into a `sonnet` agent on *every* run, including a
run that documents one `client/` component — and would still not make the agent
invoke anything, because nothing in the prompt would tell it to. Two of the five
would also make it write something false (D5, D6). Three more disagreements:
`typescript-expert` is excluded outright (D4); the proposal's
`frontend-architecture` is not a real skill name (D3); and Diátaxis is used as a
content classifier, never as a folder scheme (D7).

**Out of scope:**
- Any runtime code — no `server/`, `client/`, `reviewer-core/`, `e2e/`, no DB, no
  contract, no migration, no test.
- Editing the `onion-architecture` or `mermaid-diagram` skills to fix the false
  claims at their source. D5/D6 add a counter-instruction to `doc-writer`; fixing
  the skills themselves is a separate change (§12).
- Any other agent file's skill routing. `implementer` and `test-writer` already
  have theirs and are correct.
- Adding a doc-CI pipeline (link check, prose lint, Mermaid lint). §12.
- Writing the new prompt body prose. This plan *specifies* every section; the
  implementer writes it.

## 2. Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **`skills:` stays exactly `mermaid-diagram`. The fix is a `# Skill routing` section, not more preloads.** The rule the file will state: *preload what every run needs; route what some runs need.* `onion-architecture`, `frontend-ui-architecture` and `engineering-insights` are routed on demand through the `Skill` tool the agent already holds. | Keeps the repo precedent (spec `05` D9, `specs/05-claude-code-subagents.md:77`: one preload per agent that needs one; `implementer` and `test-writer` preload none) and keeps `onion-architecture` + `frontend-ui-architecture` (22,399 B ≈ 5.6k tokens, of which only the ring table, the decision path and the ~2 KB client-layout section are doc-relevant) out of context on runs that do not need them. Costs one `Skill` call of latency when a run *does* touch `server/` or `client/` docs, and depends on the prompt actually saying "invoke before writing" — which is the point of the new section. **There is no documented ceiling or recommended number of preloads**; the docs' only nearby numbers are a 1%-of-context skill-listing budget, a 15,000-token combined `description` budget, ~100 tokens of metadata per skill, and a "keep a `SKILL.md` under 500 lines" authoring guideline. So this is a judgement call, and neither the plan nor the prompt may imply the docs endorse it. |
| D2 | **`mermaid-diagram` keeps its preload.** It is the one skill needed on 100% of runs — every deliverable carries a diagram — which is exactly the criterion in D1. | 7,201 B on every run, unchanged from today. Only its type-choice table (`SKILL.md:23-37`) and its Do/Don't (`:225-242`) are doc-relevant; the rest is Express/Mongo examples the prompt already forbids copying (`doc-writer.md:102-103`). Nothing to change in the frontmatter. |
| D3 | **The skill is `frontend-ui-architecture`. `frontend-architecture` does not exist** and must appear nowhere in the file. The routing table names only skills that resolve to a directory under `.claude/skills/`. | `ls .claude/skills/` lists `frontend-ui-architecture`; its `SKILL.md:2` is `name: frontend-ui-architecture`. `rg -n 'frontend-architecture'` repo-wide hits only `INSIGHTS.md` (the 2026-08-04 rename entry) and `specs/05-…` — never a skill. Per the docs, a skill listed in `skills:` that is missing or disabled is **skipped with only a debug-log warning**, so the wrong name in frontmatter fails silently and the wrong name in a routing table produces a `Skill` call that finds nothing. This is why AC-2 exists. |
| D4 | **`typescript-expert` is excluded, and named in the "Not yours" line so a later editor does not re-add it.** | 431 lines / 14,791 B with zero repo facts — type-level programming, tsconfig, perf. `doc-writer` writes no types, and loading it would not change a sentence in any document. Same reasoning excludes `postgresql-table-design`, `drizzle-orm-patterns`, `fastify-best-practices`, `zod`, `react-best-practices`, `react-testing-library`; `security` belongs to the security reviewer; `next-best-practices` is `user-invocable: false` (`.claude/skills/next-best-practices/SKILL.md:4`) so it cannot be invoked by name at all; `pr-self-review` is a PR gate that excludes `**/*.md` and `docs/**`. |
| D5 | **The prompt carries an explicit `arch:check` counter-instruction.** `onion-architecture` is routed for `server/`+`reviewer-core/` docs, but the agent is told in the same section that the skill's enforcement claim is false and must never reach a document. | `.claude/skills/onion-architecture/SKILL.md:113-118` and its `README.md:36-42` state that import discipline is checked by dependency-cruiser "wired into CI as `pnpm arch:check`". On disk: no `server/.dependency-cruiser*` (glob matches nothing), no `arch` script in `server/package.json` (only the `dependency-cruiser` devDependency at `server/package.json:24`), and no CI step (`rg -n 'arch:check' .github/workflows/` is empty). `server/INSIGHTS.md:39-46` (2026-09-21) says so plainly and `.claude/skills/README.md:11` says "no `arch:check` script exists yet" — but root `INSIGHTS.md:127` (2026-08-05) still claims `dependency-cruiser` layer rules and CI lint steps landed, with no nested correction. So a recall hit is not proof either, and the prompt must say which source wins. Cost: one more thing to unwind if `arch:check` is ever actually wired (§10). |
| D6 | **Repo neighbours beat the `mermaid-diagram` skill on id casing and diagram type.** The `# Diagrams` section stops echoing the skill's "camelCase ids" and instead states: match the neighbouring diagram; default to `flowchart`. | **camelCase appears in zero repo diagrams.** UPPERCASE is dominant — `README.md:30-32` (`WEB`, `API`, `PG`), `client/README.md:26-32`, `reviewer-core/README.md:18-23`, `server/src/modules/repo-intel/README.md:17-23` — and `server/README.md:67-69` uses lowercase single words (`repos`, `pulls`, `polling`). `doc-writer.md:91` currently echoes the skill's rule, so today the prompt contradicts every diagram in the repo. The skill also steers API flows toward `sequenceDiagram` (`SKILL.md:29`) while all six repo diagrams are flowcharts. "Match the neighbour" is already the prompt's rule in `# Format` (`:86`); this makes it unambiguous for diagrams too. |
| D7 | **Diátaxis is a content classifier, not a folder scheme.** A new `# Document type` section names the four types with the compass rule and the *content prohibition* each one implies; the existing routing table (`doc-writer.md:62-77`) keeps deciding *where* a file goes and is not replaced. No `tutorials/ how-to/ reference/ explanation/` directories are created. | Diátaxis itself discourages empty type folders ("It certainly does not mean that you should create empty structures … with nothing in them") and calls itself a guide and a map, not a plan — structure emerges iteratively. Classification is load-bearing because the prohibitions are: reference "describes and only describes" (no instruction, no explanation, no opinion) and mirrors the product's structure; explanation carries the bigger picture, design decisions and alternatives but no step-by-step and no machinery detail; how-to is goal-oriented for the already-competent, where practical usability beats completeness; a tutorial's every step produces a visible result and "is not the place for explanation". Mixing is the failure mode Diátaxis names most, and the prescribed fix is separation plus links — never a "mixed" type. |
| D8 | **Fallback type: `orientation` — declared, not smuggled.** When a deliverable is none of the four, the agent names it `orientation` (or `dated record` for `docs/experiments/` and `research/`), states the choice in the report, and applies only the house format for that artifact. | Diátaxis gives **no guidance on READMEs, ADRs, specs or changelogs**, and four of `doc-writer`'s five destinations are README-shaped or dated write-ups. Its claim of exhaustiveness ("there could not be three, or five") is contested, but the criticism found is blog-level, not from the authors, and none of it addresses small internal engineering repos — so the prompt must present Diátaxis as a useful lens with a stated fallback, not as settled fact. Without the fallback the agent would force a package README into "explanation" and start explaining in a file whose house format is title + purpose + diagram + Testing. |
| D9 | **`path:line` citation is attributed to this repo, not to an external standard.** | No primary source on documentation practice prescribes `path:line` citation or commit-stamping in prose docs. It is this repo's own convention — INSIGHTS `Evidence:` lines, specs citing `path:line` — and the prompt's `## Grounded in` table already rests on it (`doc-writer.md:130-133`, `:162`). What *is* external and citable: change the docs in the same change as the code; document the current version and avoid *now / new / currently / latest / soon* without a date or version; a document needs an owner and a recorded review date or it goes stale. Those become a short `# Staleness` addition (§6, section 6). |
| D10 | **Two sections are cut to pay for the additions**: `# Non-goals` (`:151-158`) collapses to two lines pointing at the routing table and Hard rules, and `# Diagrams` (`:88-103`) drops its restatement of the preloaded skill's own rules. | The file goes 164 → ~215 lines net. `# Non-goals` today re-states Hard rules 3/4/5 and five NEVER rows of the routing table; duplication in a prompt is a drift risk, not redundancy. `# Diagrams`'s "one direction per diagram, at most about 20 nodes, camelCase ids, no hardcoded colours" is a paraphrase of `mermaid-diagram/SKILL.md:225-242`, which is preloaded in full — and one quarter of it is wrong (D6). See §10. |

## 3. What already exists — do not rebuild

| Layer | Already there | File |
|-------|---------------|------|
| The agent file itself — **edit, do not create** | yes, 164 lines | `.claude/agents/doc-writer.md` |
| The house skill-routing shape to copy (heading, one-sentence rule, 2-column table, "Not yours" line) | yes — copy the shape, do not invent one | `.claude/agents/implementer.md:100-120`, `.claude/agents/test-writer.md:71-83` |
| The `## Skills applied` output-row shape (Skill \| Where \| What it changed) | yes | `.claude/agents/implementer.md:211-214` |
| The "let `engineering-insights` decide whether anything clears its bar" wording | yes — reuse, do not re-derive | `.claude/agents/implementer.md:95-98` |
| The recall half of `engineering-insights` (read the module's + the root `INSIGHTS.md` first; verify anything a dated entry cites still exists) | yes — the agent must *invoke* it, not re-implement it | `.claude/skills/engineering-insights/SKILL.md:21-24` |
| The routing source for which skill covers which layer | yes | `.claude/skills/README.md:9-23` |
| `onion-architecture`'s ring→path map, the hand-rolled-DI fact, the "where does this go" decision path, the `server/src/` tree, the module tiers | yes — this is *why* it is routed for backend docs | `.claude/skills/onion-architecture/SKILL.md:29-44`, `:24-27`, `:86-111`; `references/layermap.md:9-19`, `:101-117` |
| `frontend-ui-architecture`'s repo-specific `client/` layout section | yes — the ~2 KB that earns the routing | `.claude/skills/frontend-ui-architecture/SKILL.md:47-103` |
| `mermaid-diagram` type-choice table + Do/Don't | yes, preloaded | `.claude/skills/mermaid-diagram/SKILL.md:23-37`, `:225-242` |
| Six real in-repo diagrams that define the id casing and the flowchart default | yes | `README.md:27-50`, `client/README.md:24-40`, `server/README.md:33`, `server/README.md:64-86`, `reviewer-core/README.md:16-24`, `server/src/modules/repo-intel/README.md:16-24` |
| The `doc-writer` section of the agent map, incl. the **Preloaded skill** row | yes — must be **edited** (§9 B) | `.claude/agents/README.md:200-218` (heading `:200`, Preloaded skill row `:210`, Boundaries `:215-218`) |
| Frontmatter key list, the "unrecognised key is ignored silently" warning, and the one-line `node -e` validator | yes — reuse as V1, do not re-derive | `.claude/agents/README.md:303-315` |
| The `skills:`-preloads-the-full-body doc row and the skill-routing source row in the map's Sources tables | yes — extend, do not duplicate | `.claude/agents/README.md:235`, `:268` |

Nothing in this plan is pre-staged. Verified by:
`rg -n 'Skill tool|invoke the skill|Skills applied|Skill routing|Diátaxis|diataxis|arch:check' .claude/agents/doc-writer.md`
(no hits), `grep -n '^# ' .claude/agents/doc-writer.md` (nine sections, none about
skills or document type), and `rg -n 'doc-writer' specs/` (only `specs/05-…` §6.4).

## 4. Data model

**N/A — this change adds no runtime code.** No table, no column, no migration.
`pnpm db:generate` is not run in any phase. Tripwires T2, T3, T4 do not apply.

## 5. Contracts (`@devdigest/shared`)

**N/A — this change adds no runtime code.** Neither `server/src/vendor/shared/`
nor `client/src/vendor/shared/` is touched, so T1, T3, T6 and T7 do not apply to
the deliverable.

## 6. The upgraded agent file

One file is edited: `.claude/agents/doc-writer.md`. **Frontmatter is unchanged**
— that is itself the decision (D1), and stating it stops a future reader from
assuming the `skills:` line was overlooked. Verbatim, all seven lines as they
stand at `:1-16`:

| Key | Value | Change |
|---|---|---|
| `name` | `doc-writer` | unchanged |
| `description` | the existing `>-` folded block (`:3-11`) | **unchanged** — nothing about the defect changes *when* the agent should be delegated to, and all `description` fields share a 15,000-token budget |
| `tools` | `Read, Write, Edit, Bash, Grep, Glob, TodoWrite, Skill` | unchanged — `Skill` is already granted; that is the point |
| `disallowedTools` | `WebSearch, WebFetch` | unchanged |
| `model` | `sonnet` | unchanged (spec `05` D5) |
| `skills` | `mermaid-diagram` | **unchanged — D1/D2.** Not four entries, not five. Because nothing is added here, the silent-skip failure mode of a mistyped skill name (D3) cannot be introduced by this change in frontmatter; it can only be introduced in the new routing table, which AC-2 checks. |
| *(no `effort`)* | | unchanged (spec `05` D8) |

A comment line in the prompt body must record *why* `skills:` has one entry, so
the next editor does not "fix" it: one sentence under `# Skill routing`, citing
that `skills:` controls preloading and not access, and that a routed skill is
reachable through the `Skill` tool the agent already has.

### Section-by-section

**Existing sections kept byte-identical:** `# Role` (`:18-24`),
`# Gate: clarify before writing` (`:42-60`),
`# Where it goes — the routing table` (`:62-77`) — D7: it is not replaced —
`# Format` (`:79-86`), `# Input you expect` (`:146-149`),
`# Quality bar` (`:160-164`).

**1. `# Hard rules` — one clause added, nothing removed.** A new rule 8:
*invoke the skill the routing table names before writing the document; a
document written without its routed skill is not done.* This mirrors
`implementer.md:87-89` ("A step whose skill you did not invoke is not done") and
is the single sentence whose absence is the whole defect.

**2. `# Skill routing` — NEW, placed immediately after `# Format`.** Four parts,
in the `implementer.md:100-120` / `test-writer.md:71-83` shape:

*(a)* A one-sentence when-to-invoke rule: invoke **before** writing the
document, not while reviewing it; routing source `.claude/skills/README.md`.

*(b)* The table. Left column keyed by **what the document is about**, not by
where the file lands — a `server/README.md` edit about the module layout needs
`onion-architecture` just as a `server/docs/<topic>.md` does:

| The document describes | Invoke |
|---|---|
| `server/**` or `reviewer-core/**` — rings, where logic/DB access/external I/O lives, the DI container, module layout | `onion-architecture` |
| `client/**` — folder layout, where a page/component/hook lives, `_components/<PascalName>/`, Server/Client boundary | `frontend-ui-architecture` |
| any diagram — choosing the type | `mermaid-diagram` (**preloaded** — already in context, no call needed) |
| before writing, in any module | `engineering-insights` (recall) |
| at the end of the task | `engineering-insights` (record) |

*(c)* The "Not yours" line, naming at minimum: `typescript-expert` (no repo
facts, and you write no types — D4), `pr-self-review` (a PR gate that excludes
`**/*.md` and `docs/**`), `security` (the security reviewer's), and
`next-best-practices` (`user-invocable: false`, it cannot be invoked by name).

*(d)* **`## What these two skills get wrong here`** — two bullets, each an
explicit counter-instruction, because the agent's output is prose that a human
will trust:

- **`arch:check` / dependency-cruiser do not exist** (D5). `onion-architecture/SKILL.md:113-118`
  and `onion-architecture/README.md:36-42` say boundaries are checked by
  `pnpm arch:check` in CI. They are not. Never write that into a document. Onion
  boundaries in this repo are **reviewer-enforced only**. Truth:
  `server/INSIGHTS.md:39-46` (2026-09-21) and `.claude/skills/README.md:11`.
  Root `INSIGHTS.md:127` (2026-08-05) claims the opposite and has **no nested
  correction**, so a recall hit on it is not proof — the later, more specific
  entry wins. Check before writing: `rg -n 'arch:check' server/package.json .github/workflows/`.
- **camelCase diagram ids are wrong here** (D6) — see `# Diagrams` below.

**3. `# Document type` — NEW, placed immediately before `# Diagrams`.** Must
contain, and nothing beyond:

- The compass rule in one line: content informing **action** for **acquisition**
  = tutorial; action for **application** = how-to; **cognition** for application
  = reference; cognition for acquisition = explanation. The practical test:
  reference is what someone needs *while working*; explanation is what they turn
  to *to acquire understanding*.
- One prohibition per type, because that is what changes the writing:
  **reference** describes and only describes — no instruction, no explanation, no
  opinion — and mirrors the structure of the thing it documents;
  **explanation** carries the bigger picture, the design decisions and the
  alternatives, and contains no step-by-step and no machinery detail;
  **how-to** is goal-oriented for someone already competent, and practical
  usability beats completeness; **tutorial** makes every step produce a visible
  result and is not the place for explanation.
- The mixing rule: mixing types is the named failure mode, tutorial/how-to most
  of all, and the fix is **separation plus links** — never a "mixed" type.
- The fallback (D8): a deliverable that is none of the four is `orientation`
  (package and root READMEs) or `dated record` (`docs/experiments/`,
  `research/`). Diátaxis gives no guidance on READMEs, ADRs, specs or
  changelogs; say so, declare the type in the report, and apply the house format
  for that artifact from `# Format` instead of a Diátaxis prohibition.
- One explicit non-instruction (D7): **do not create
  `tutorials/`, `how-to/`, `reference/`, `explanation/` folders.** Diátaxis
  discourages empty type structures; `# Where it goes` decides placement, this
  section decides content. Root `docs/` still has exactly three subfolders.
- One honesty line: Diátaxis is a lens with a contested exhaustiveness claim, not
  a repo standard — do not cite it as a rule the repo enforces.

**4. `# Diagrams` — rewritten (D6, D10).** Drops the restatement of the
preloaded skill's rules (`:90-92`). Keeps the repo facts at `:94-103` verbatim,
including the "attributed to this repo, not to Anthropic" clause and the
"`mermaid-diagram`'s own examples are Express/Mongo and must not be copied
verbatim" clause. Adds two overrides, stated as overrides:

- **Node ids match the neighbouring diagram.** UPPERCASE is the dominant house
  style (`README.md:30-32`, `client/README.md:26-32`,
  `reviewer-core/README.md:18-23`, `server/src/modules/repo-intel/README.md:17-23`);
  `server/README.md:67-69` uses lowercase single words. **camelCase appears in
  zero repo diagrams**, so the skill's "camelCase for IDs"
  (`mermaid-diagram/SKILL.md:232`) is overridden here.
- **Default to `flowchart`.** All six in-repo diagrams are flowcharts; the
  skill's steer toward `sequenceDiagram` for API flows (`SKILL.md:29`) is a
  suggestion, and choosing it is a new precedent to be called out in the report.

**5. `# Procedure` — rewritten, 5 steps → 8.** The two new bookends and the
routing step are the fix:

1. **Recall.** Invoke `engineering-insights` to read the target module's
   `INSIGHTS.md` **and** the root one before writing
   (`engineering-insights/SKILL.md:21-24`); an entry names a date, so verify
   anything it cites still exists before repeating it in a document.
2. Read the plan or report, then read the code it names and confirm it is there.
   *(today's step 1, unchanged)*
3. **Classify** the deliverable per `# Document type`, and note the one thing it
   therefore must not contain.
4. **Invoke the routed skill** for what the document describes, per
   `# Skill routing`, before writing a line.
5. Grep for an existing doc on the topic before creating one; update rather than
   duplicate, and note any doc the change made stale. *(today's step 2)*
6. Write the doc. *(today's step 3)*
7. Add the `AGENTS.md` **Read when** link in the same change. *(today's step 4)*
8. **Record.** Invoke `engineering-insights` **and let it decide whether
   anything clears its bar** — per root `AGENTS.md` the step is not optional; the
   *writing* is skipped only when nothing non-obvious came up. Wording matched to
   `implementer.md:95-98`.

**6. `# Staleness` — NEW, short (D9), placed after `# Format`.** Four lines, each
attributable: change the documentation in the same change as the code; document
the current version and avoid *now / new / currently / latest / soon* unless a
date or a version is given; a document with no owner and no recorded review date
goes stale, so a dated write-up (`docs/experiments/`, `research/`) carries its
date in the header the routing table already requires; a doc that names a code
element which no longer exists is mechanically stale — which is what
`## Stale docs found` is for. **`path:line` citation is this repo's convention**
(INSIGHTS `Evidence:` lines, specs), not an external standard — say so.

**7. `# Output — the Documentation Report` — two rows added, one changed.**
Fenced `~~~` as today (`.claude/agents/README.md:317-320`: a template containing
an indented ``` fence must be fenced with `~~~`).

- **NEW `## Document type`**, placed directly after `## Written`: the Diátaxis
  type or the declared fallback, plus the one thing the document therefore does
  not contain.
- **NEW `## Skills applied`**, placed directly after `## Diagram`, in the
  `implementer.md:211-214` shape:

| Skill | Where | What it changed in the document |
|-------|-------|---------------------------------|
| `onion-architecture` | `server/docs/<topic>.md` § rings | used the skill's ring→path map instead of inferring layers from folder names |

  Plus a required honesty line under the table: name any routed skill that was
  **not** invoked and why, and state explicitly when a skill's claim was
  overridden (e.g. "`arch:check` claim not repeated — D5").
- **CHANGED `## Insight recorded`** → two lines: `recalled:` the `INSIGHTS.md`
  files read in Procedure step 1, and `recorded:` file + section, or
  `none — nothing cleared the skill's bar`.

**8. `# Non-goals` — cut to two lines (D10).** Keeps only what is not stated
elsewhere: does not write or edit code, tests, schema or contracts; does not run
builds or tests; does not commit or open a PR. The rest (`specs/`,
`INSIGHTS.md`, `docs/agent-prompts/`, `docs/skills/`, `.claude/**`,
documenting an unimplemented plan, inventing a style guide) is already Hard rules
1/3/4/5 and five NEVER rows of the routing table — one line points there.

## 7. Client

**N/A — this change adds no runtime code.** No file under `client/` is touched.

## 8. Acceptance criteria (EARS)

Every criterion is checkable by reading `.claude/agents/doc-writer.md` (plus
`.claude/agents/README.md` for AC-10); none requires running the agent.

- **AC-1** Where the file is read, the system shall contain a `# Skill routing`
  heading whose section holds a one-sentence when-to-invoke rule, a two-column
  table, and a "Not yours" line naming `typescript-expert`, `pr-self-review`,
  `security` and `next-best-practices`.
- **AC-2** Where the routing table names a skill, the system shall name only
  `onion-architecture`, `frontend-ui-architecture`, `mermaid-diagram` and
  `engineering-insights`, each resolving to an existing directory under
  `.claude/skills/`; the string `frontend-architecture` shall not appear
  anywhere in the file as a skill name.
- **AC-3** Where the frontmatter is read, `skills:` shall be exactly
  `mermaid-diagram`, and the prompt body shall state in one sentence why that is
  one entry and not four.
- **AC-4** Where the output template is read, the system shall contain a
  `## Skills applied` row and a `## Document type` row, and `## Insight
  recorded` shall ask for both a recalled and a recorded line.
- **AC-5** Where the `# Document type` section is read, the system shall name
  all four Diátaxis types, one content prohibition for each, a declared
  fallback type, and an explicit instruction not to create type folders.
- **AC-6** When the agent documents `server/` or `reviewer-core/`, the prompt
  shall have told it that `pnpm arch:check` and the dependency-cruiser CI step
  do not exist, that onion boundaries are reviewer-enforced, and which command
  re-checks that.
- **AC-7** Where the `# Diagrams` section is read, the system shall state that
  node ids match the neighbouring diagram — citing both the UPPERCASE and the
  lowercase precedents — and shall no longer instruct camelCase ids.
- **AC-8** Where `# Procedure` is read, step 1 shall be an
  `engineering-insights` recall before any writing, and the final step shall
  invoke `engineering-insights` with the "let it decide whether anything clears
  its bar" condition.
- **AC-9** When the frontmatter validator at `.claude/agents/README.md:315` is
  run, it shall report `doc-writer.md ok`.
- **AC-10** Where `.claude/agents/README.md` is read, the `doc-writer` section
  shall show both a **Preloaded skill** row (`mermaid-diagram`) and a **Routed
  skills** row naming the three on-demand skills, and the Sources tables shall
  carry a row for the Diátaxis classifier and one for the `arch:check`
  counter-instruction.
- **AC-11** While the file grows, it shall stay under 240 lines, and the
  `# Non-goals` section shall be at most three lines.

## 9. Implementation plan

No package manager runs in any phase (T9 is moot — nothing under `server/`,
`client/`, `reviewer-core/` or `e2e/` is touched, so no lockfile can be
created). Every phase ends with the file parseable and the validator green;
there is no typecheck because there is no code.

### Phase A — `.claude/agents/doc-writer.md`

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| A1 | Confirm the defect is still exactly as §1 describes before editing: `rg -n 'Skill tool\|invoke the skill\|Skill routing\|Skills applied' .claude/agents/doc-writer.md` returns nothing, and `grep -n '^# ' ` lists the nine current sections. If either differs, stop and report — the file moved under the plan. | `.claude/agents/doc-writer.md` (read only) | — (§3) | — |
| A2 | Add Hard rule 8 — invoke the routed skill before writing; a document written without it is not done. Do not renumber or reword rules 1–7. | `.claude/agents/doc-writer.md:26-40` | — (§6.1) | AC-1 |
| A3 | Insert the new `# Skill routing` section after `# Format`: the when-to-invoke sentence, the five-row table, the `skills:`-is-one-entry sentence, and the "Not yours" line. Shape copied from `implementer.md:100-120`. | `.claude/agents/doc-writer.md` (after `:86`) | — (§6.2) | AC-1, AC-2, AC-3 |
| A4 | Append the `## What these two skills get wrong here` sub-block to `# Skill routing`: the `arch:check` counter-instruction with its four citations and its `rg` check, and the camelCase-id pointer. | `.claude/agents/doc-writer.md` | — (§6.2d) | AC-6 |
| A5 | Insert the new `# Staleness` section after `# Format`. Four lines; the `path:line`-is-ours attribution is one of them. | `.claude/agents/doc-writer.md` | — (§6.6) | — |
| A6 | Insert the new `# Document type` section immediately before `# Diagrams`: compass rule, four prohibitions, mixing rule, fallback, the no-type-folders instruction, the honesty line. | `.claude/agents/doc-writer.md` (before `:88`) | — (§6.3) | AC-5 |
| A7 | Rewrite `# Diagrams`: delete the restatement at `:90-92`, keep `:94-103` verbatim, add the id-casing override with both precedents and the `flowchart` default. | `.claude/agents/doc-writer.md:88-103` | `mermaid-diagram` | AC-7 |
| A8 | Rewrite `# Procedure` as the 8 steps of §6.5, in order. | `.claude/agents/doc-writer.md:105-112` | — (§6.5) | AC-8 |
| A9 | Add `## Document type` and `## Skills applied` to the output template and split `## Insight recorded` into `recalled:` / `recorded:`. Keep the outer fence `~~~`. | `.claude/agents/doc-writer.md:114-144` | — (§6.7) | AC-4 |
| A10 | Cut `# Non-goals` to the three non-duplicated clauses plus one pointer line. | `.claude/agents/doc-writer.md:151-158` | — (§6.8) | AC-11 |
| A11 | Run the frontmatter validator (`.claude/agents/README.md:315`) and confirm `doc-writer.md ok`. The frontmatter was not edited; this proves no accidental change. | — | — | AC-9 |

### Phase B — the agent map

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| B1 | Add a **Routed skills** row (`onion-architecture`, `frontend-ui-architecture`, `engineering-insights` — on demand via `Skill`) directly under the existing **Preloaded skill** row; leave the latter as `mermaid-diagram`. | `.claude/agents/README.md:210` | — (§6) | AC-10 |
| B2 | Extend the **Output** row to mention `## Document type` and `## Skills applied`, so the map matches the template. | `.claude/agents/README.md:213` | — (§6.7) | AC-10 |
| B3 | Extend the `skills:` doc row to state the second half of the fact: the field controls which skills are **preloaded, not which the subagent can access** — a non-preloaded skill is still reachable through `Skill`. This is the sentence D1 rests on. | `.claude/agents/README.md:235` | — (§2 D1) | AC-10 |
| B4 | Add a Sources row: Diátaxis four types + content prohibitions + the no-empty-folders caveat → `doc-writer.md` `# Document type`. Note it is diataxis.fr, an external lens, not a repo standard. | `.claude/agents/README.md` (Sources, after `:248`) | — (§2 D7) | AC-10 |
| B5 | Extend the existing `arch:check`-does-not-exist Sources row (currently pointing at `planner.md:42`, `implementer.md:155`) to include `doc-writer.md`. | `.claude/agents/README.md:265-ish`, the `arch:check` row | — (§2 D5) | AC-10 |
| B6 | Extend the skill-routing Sources row at `:268` to include `doc-writer.md`. | `.claude/agents/README.md:268` | — (§2 D1) | AC-10 |

### Phase C — index drift and record

| # | Step | Files | Skill | AC |
|---|------|-------|-------|-----|
| C1 | `specs/README.md:11` lists "Current specs: `01` … `04`" and is already two behind (`05` exists, `06` is reserved elsewhere). Add `05` and this `07`, and note `06` as reserved so nobody re-uses it. **If the `06` session is expected to land first, leave this to it and say so in the report** — do not guess its slug. | `specs/README.md:11` | — | — |
| C2 | Run §11 in order and capture the real output. | — | — | AC-1…AC-11 |
| C3 | Invoke `engineering-insights` and let it decide. Candidate, if it clears the bar: *granting an agent the `Skill` tool does nothing unless the prompt names when to call it — `doc-writer` held `Skill` and one preload for a full release with no routing table, and the fix was an instruction, not more context.* Route: root `INSIGHTS.md` (`.claude/` tooling is cross-package). | `INSIGHTS.md` via the skill | `engineering-insights` | — |

## 10. Risks & gotchas

- **The file gets longer — and this plan says what pays for it.** 164 → ~215
  lines (+~90 added, −~25 cut). Two cuts, both in D10: `# Non-goals` loses five
  of its eight clauses because they duplicate Hard rules 1/3/4/5 and five NEVER
  rows, and `# Diagrams` loses its three-line restatement of a skill that is
  preloaded in full. Context for comparison: `planner.md` is 259 lines,
  `implementer.md` 257, `researcher.md` 241 — so ~215 sits mid-pack, not at a new
  high. AC-11 caps it at 240. **If an implementer finds itself above 240, cut
  further from `# Non-goals` and from the `# Document type` honesty line — never
  from `# Skill routing` or the `arch:check` counter-instruction, which are the
  deliverable.**
- **A mistyped skill name fails silently.** Per the docs, a skill listed in
  `skills:` that is missing or disabled is skipped with only a debug-log warning;
  a routing table that names a non-existent skill produces a `Skill` call that
  finds nothing and an agent that shrugs and writes anyway. `frontend-architecture`
  is the specific trap (D3) — it reads plausibly and is what the original
  proposal said. V3 checks every skill name in the file against `ls .claude/skills/`.
- **The counter-instruction is a second place to maintain.** If `arch:check` is
  ever actually wired, three files claim it and two deny it. Today: claimed by
  `onion-architecture/SKILL.md:113-118`, `onion-architecture/README.md:36-42`,
  `references/enforcement.md:105-130` and root `INSIGHTS.md:127`; denied by
  `server/INSIGHTS.md:39-46` and `.claude/skills/README.md:11`. Fixing the skill
  at its source is out of scope (§12) — so grep for `arch:check` across
  `.claude/` before removing the counter-instruction.
- **`doc-writer` cannot document itself.** Its own routing table forbids writing
  to `.claude/agents/**` (`doc-writer.md:72`). Phase B is the *implementer's*
  edit, not a `doc-writer` run — do not delegate B1–B6 to the agent this plan
  changes.
- **Diátaxis could make the agent worse, not better, if applied to a README.**
  Four of five destinations are README-shaped or dated write-ups, none of which
  Diátaxis addresses. Without the D8 fallback the agent will force a package
  README into "explanation" and start explaining in a file whose house format is
  title + purpose + diagram + Testing. The fallback is not optional garnish; it
  is what keeps AC-5 from regressing the output.
- **The routing table must be keyed by subject, not by path.** A
  `server/README.md` edit lands outside `server/docs/` but is still about the
  onion rings. §6.2b says "the document describes" for exactly this reason; an
  implementer who rewrites the column header as "the document lands in"
  reintroduces the gap.
- **T9 (wrong package manager)** — no phase runs a package manager at all. The
  only command in §11 is `node -e` and `rg`. If an implementer reaches for
  `pnpm` or `npm` here, something has gone wrong.
- **Phase C1 can collide with the reserved `06` session.** Two sessions editing
  `specs/README.md:11` is a merge conflict on one line. Cheap to resolve; flagged
  so it is not a surprise.

## 11. Verification

No typecheck and no test run: this change adds no runtime code, so
`tsc --noEmit` and `vitest` have nothing to say about it. Every row below is a
read.

| # | Command | Expected |
|---|---------|----------|
| V1 | the `node -e` frontmatter validator at `.claude/agents/README.md:315`, run from the repo root | `doc-writer.md ok` — and every other agent still `ok` (AC-9) |
| V2 | `rg -n '^# Skill routing' .claude/agents/doc-writer.md` and `rg -n 'Not yours' .claude/agents/doc-writer.md` | one hit each (AC-1) |
| V3 | `rg -o -N '`[a-z-]+`' .claude/agents/doc-writer.md \| tr -d '`' \| sort -u` cross-checked against `ls .claude/skills/` | every skill-shaped token that names a skill exists as a directory; `frontend-architecture` absent (AC-2) |
| V4 | `rg -n 'frontend-architecture' .claude/agents/doc-writer.md` | no hits (AC-2) |
| V5 | `sed -n '/^---$/,/^---$/p' .claude/agents/doc-writer.md \| rg -n '^skills:'` | exactly `skills: mermaid-diagram` (AC-3) |
| V6 | `rg -n '^## (Document type\|Skills applied\|Insight recorded)' .claude/agents/doc-writer.md` | three hits, in that order within the output template (AC-4) |
| V7 | `rg -n -i 'tutorial\|how-to\|reference\|explanation\|orientation' .claude/agents/doc-writer.md` | all four types plus the fallback present in `# Document type`; read the section and confirm one prohibition per type and the no-type-folders line (AC-5) |
| V8 | `rg -n 'arch:check' .claude/agents/doc-writer.md` | at least one hit, in the counter-instruction (AC-6) |
| V9 | **reality check** — `rg -n 'arch:check' server/package.json .github/workflows/` and `ls server/.dependency-cruiser* 2>&1` | no matches in either; confirms the counter-instruction is still true and the skill is still wrong (AC-6). If this row ever *does* match, the counter-instruction must be revisited before the file ships |
| V10 | `rg -n -i 'camelCase' .claude/agents/doc-writer.md` | no hits (AC-7) |
| V11 | `rg -n 'UPPERCASE\|README.md:30-32\|server/README.md:67-69' .claude/agents/doc-writer.md` | the id-casing override names both precedents (AC-7) |
| V12 | `sed -n '/^# Procedure/,/^# /p' .claude/agents/doc-writer.md` | step 1 is an `engineering-insights` recall; the last step carries "clears its bar" (AC-8) |
| V13 | `rg -n 'Routed skills\|Preloaded skill' .claude/agents/README.md` | both rows present in the `doc-writer` section (AC-10) |
| V14 | `wc -l .claude/agents/doc-writer.md` and `sed -n '/^# Non-goals/,/^# /p' .claude/agents/doc-writer.md \| wc -l` | under 240; `# Non-goals` at most three content lines (AC-11) |
| V15 | **end-to-end**: run `doc-writer` on a `server/` topic (e.g. "document `server/src/platform/container.ts` for a contributor new to the module") and read its report | the report's `## Skills applied` names `onion-architecture` with what it changed; `## Document type` declares a type and its prohibition; `## Insight recorded` has a `recalled:` line; and the document does **not** claim `pnpm arch:check` (AC-4, AC-5, AC-6, AC-8). Discard the produced doc if it is only a smoke test |

## 12. Open questions

- **Should the `onion-architecture` skill itself be fixed, rather than
  counter-instructed?** `SKILL.md:113-118`, `README.md:36-42` and
  `references/enforcement.md:105-130` describe an enforcement mechanism that does
  not exist, and root `INSIGHTS.md:127` still asserts it landed. Three options:
  (a) leave the counter-instruction in `doc-writer` only, as this plan does;
  (b) correct the skill and add the nested correction to root `INSIGHTS.md`, then
  drop the counter-instruction; (c) actually wire `arch:check`, which
  `server/INSIGHTS.md:43-46` says has a known gotcha. **The requester decides** —
  (b) and (c) are separate specs and (c) touches `server/` and CI.
- **Should `mermaid-diagram`'s "camelCase for IDs" (`SKILL.md:232`) be corrected
  at source?** It contradicts all six repo diagrams. D6 overrides it inside
  `doc-writer`; every other agent and every human reading that skill still gets
  the wrong advice. **Requester decides** whether that is in scope for a skill
  edit.
- **Is `240` the right line cap for an agent prompt?** AC-11's number is a
  judgement call against `planner.md` (259) and `implementer.md` (257); there is
  no documented ceiling for a subagent prompt body. If the requester wants a
  house cap, it belongs in `.claude/agents/README.md`, not in this plan.
- **Does the requester want doc-CI (link check, prose lint, Mermaid syntax
  lint)?** Those are the documented external practices, they would catch the
  staleness `# Staleness` only asks the agent to self-police, and there are five
  per-package workflows with no root one to hang them off. Out of scope here; a
  spec of its own if wanted.
