# 03 — Skills: reusable review guidance for agents

> Status: **v1 implemented** (2026-09-21) · **v2 implemented** (2026-09-21, §10 —
> the rail + tabbed-editor redesign and the Stats tab). Cross-module: `server/` +
> `client/` (+ a `reviewer-core` read-only touch-point and seed data). EARS
> acceptance criteria are in §9 (v1) and §10.8 (v2). Mirrors the shape of
> [`02-findings-on-timeline.md`](02-findings-on-timeline.md).
>
> **v2 supersedes the `/skills` layout described in §1, §6 and D2**: the card grid +
> drawer became a list rail + tabbed editor (Config · Preview · Evals · Stats ·
> Versions) after a design review. §1–§9 are kept as the record of v1; §10 is the
> delta and wins where they disagree.

## 1. Summary

A **skill** is a reusable unit of review guidance: a name, a *directive*
description (its interface), a type, and a markdown body. It is **text and
configuration only** — a skill never executes code, never declares tools, never
touches the filesystem or the network. Agents bind skills; the bound skills whose
global switch is on are appended to the agent's prompt, in the order the user chose,
as the `## Skills / rules` section.

Delivered surface:

- **Storage** — `server/src/modules/skills/` CRUD over the existing `skills` table;
  the DB is the source of truth.
- **`/skills` page** — a card grid (name · type · description · enabled toggle ·
  "used by N agents"). Clicking a card opens a side **Drawer** with a preview; *Edit*
  turns the same drawer into the form. *Add Skill* offers **Create** / **Import**.
- **Agent editor → Skills tab** — one row per workspace skill with a checkbox
  (bound or not), drag / ↑↓ reorder of the bound ones, a filter, and a
  "N of M enabled" badge. Order = block order in the prompt.
- **Import** — a `.md` file or a `.zip` archive. The server extracts the skill core
  (`SKILL.md` + frontmatter), returns a **preview** and persists **nothing**; the
  user confirms before it is saved. Every non-core archive member is listed as
  *ignored*; executable-looking ones are flagged. Nothing is executed or written to
  disk.
- **Prompt wiring** — `run-executor` resolves the agent's bound + enabled skills and
  passes their bodies to `reviewPullRequest`; the Live Log shows one line per
  attached skill with its token cost; the trace drawer's prompt-assembly section
  shows the skills block with a `~N tokens` chip.
- **Seed** — two new built-in agents, *Test Quality Reviewer* and *API Contract
  Reviewer*, each with three seeded skills bound, so the control experiment
  reproduces from a fresh clone. Prompts live in `docs/agent-prompts/`.

### Decisions (confirmed with the owner, 2026-09-21)

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Built from the task description, **not** from the reference build in git history (`376ac49`). | Layout differs from the reference (card grid + drawer instead of rail + 5 tabs). |
| D2 | Skill editing happens **inside the drawer** (preview → *Edit* → form). One route, `/skills`. | No `/skills/[id]` page. |
| D3 | The agent-tab checkbox **binds** (two states). No per-link `enabled` flag. `skills.enabled` is the global kill-switch shown on the card. | **No migration.** `agent_skills` keeps `(agent_id, skill_id, order)`. |
| D4 | Skill bodies are injected as **trusted text**, exactly like the agent's own system prompt — no delimiters. An imported skill is marked by `source` and carries a trust notice in the UI. | No `reviewer-core` change. "Someone else's skill is someone else's instructions in your agent's prompt" is a product/UX statement, enforced by the preview-then-confirm import flow. |
| D5 | Editing `name` / `description` / `type` / `body` bumps `skills.version` and snapshots the body into `skill_versions`; toggling `enabled` does not. | Mirrors `AgentsRepository.update`. Versions are read-only history in v1 (shown as `vN`). |
| D6 | Import parsing is **server-side**; the client base64-encodes the file and POSTs JSON. `fflate` is the one new server dependency (zip). | No multipart plugin. Fastify's 1 MB body cap bounds the upload; the parser adds its own limits (§5.3). |
| D7 | File imports persist with `source = 'imported_url'` (the existing enum's "imported" bucket, labelled *Imported*). | No enum change; the owner's local DB carries a leftover CHECK constraint on `skills.source` from the reference schema, so a new value would fail there. |
| D8 | The experiment PRs are **not** part of this change (the owner has them). | — |
| D9 | The sidebar gets a **SKILLS LAB** group (Skills · Agents) by editing the vendored `client/src/vendor/ui/nav.ts`. | The only way to add a nav item; a deliberate, minimal vendor edit. |

### Out of scope

- Per-agent enable/disable of a bound skill (D3), skill evals/stats, restore from a
  version, URL / community import (the i18n strings for them stay unused).
- Changing an agent's bindings does **not** bump the agent's config version.
  `agent_versions.config_json.skills` still records the bound ids at snapshot time.
- The CI runner (`agent-runner`) — it resolves skills from the filesystem later.

## 2. Background — what the starter already ships

| Layer | Already there | Evidence |
|---|---|---|
| DB | `skills`, `skill_versions`, `agent_skills` | `server/src/db/schema/skills.ts`, `schema/agents.ts:51` |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink`, `AgentVersionConfig.skills` | `server/src/vendor/shared/contracts/knowledge.ts:114-199` |
| Agent-side API | `GET/POST /agents/:id/skills` (list · set-all · link-one) | `server/src/modules/agents/routes.ts` |
| Agent-side data | `linkedSkills`, `skillIdsForAgent`, `linkSkill`, `unlinkSkill`, `setSkills` | `server/src/modules/agents/repository.ts` |
| Engine | `ReviewInput.skills?: string[]` → `## Skills / rules` + `PromptAssembly.skills` | `reviewer-core/src/review/run.ts:55`, `prompt.ts` |
| Trace UI | skills block rendered when `prompt_assembly.skills != null` | `RunTraceDrawer/_components/TraceBody/TraceBody.tsx` |
| i18n | `messages/en/skills.json`, `agents.skills.*`, `agents.editor.tabs.skills` | `client/messages/en/` |
| Routing | `activeKeyFor('/skills') → "skills"` | `client/src/components/app-shell/helpers.ts` |

**Gaps:** no `skills` module, no UI, no import, no seed, and `run-executor.ts`
never passes `skills` (root `INSIGHTS.md`, 2026-08-05) — the prompt block is
always empty.

## 3. Data model

No migration (D3). Used as-is:

```
skills          id · workspace_id · name · description · type · source · body ·
                enabled · version · evidence_files · created_at
skill_versions  (skill_id, version) · body · created_at
agent_skills    (agent_id, skill_id) · order
```

Version rule (D5): a change to `name`, `description`, `type` or `body` → `version + 1`
and `INSERT skill_versions … ON CONFLICT DO NOTHING`. `enabled`-only → no bump.

## 4. Contracts (`vendor/shared/contracts/knowledge.ts`, both trees)

> ⚠️ **Drift:** `client/src/vendor/shared/` is a hand-copy of the server's canonical
> tree with no sync script — apply the identical edit to **both**.

```ts
// new
SkillSummary       = Skill.extend({ used_by: z.number().int() })     // list cards
SkillImportPreview = z.object({
  filename: z.string(),
  name: z.string(), description: z.string(), type: SkillType, body: z.string(),
  source: SkillSource,                 // 'imported_url'
  core_entry: z.string(),              // which member became the skill
  ignored_entries: z.array(z.string()),// every other member (nothing done with them)
  warnings: z.array(z.string()),       // e.g. executable-looking members
})
SkillVersion       = z.object({ skill_id, version, body, created_at })

// changed (optional, list-only — cards show "N skills")
Agent += skill_count: z.number().int().optional()
```

## 5. Server — `src/modules/skills/`

Same ring split as `agents/`: `routes.ts` (transport + zod) · `service.ts` ·
`repository.ts` (the only Drizzle user) · `helpers.ts` (pure) · `constants.ts`.
Registered with one import + one entry in `src/modules/index.ts`.

### 5.1 Routes (all workspace-scoped through `getContext`; foreign id → 404)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/skills` | — | `SkillSummary[]` (name asc) |
| GET | `/skills/:id` | uuid | `Skill` |
| POST | `/skills` | `{name, description, type, body, source?, enabled?}` | `Skill` 201 |
| PUT | `/skills/:id` | partial of the above | `Skill` (version bumped on config change) |
| DELETE | `/skills/:id` | uuid | `{ok:true}` (links cascade) |
| GET | `/skills/:id/agents` | uuid | `{id, name}[]` — shown in the delete confirm |
| GET | `/skills/:id/versions` | uuid | `SkillVersion[]` newest first |
| POST | `/skills/import` | `{filename, content_b64}` | `SkillImportPreview` — **parses only** |

### 5.2 Agents module touch-points

- `AgentsRepository.skillCounts(workspaceId)` → `Map<agentId, n>`; `AgentsService.list`
  decorates each DTO with `skill_count`.
- `AgentsRepository.enabledSkillsForPrompt(agentId)` → bound skills with
  `skills.enabled = true`, in `order`.
- `setSkills` unchanged: `POST /agents/:id/skills { skill_ids }` replaces the ordered
  set (the tab's checkbox + reorder both go through it).

### 5.3 Import parsing (`helpers.ts`, pure, unit-tested)

```
.md   → parseFrontmatter(text)           '---' block, flat `key: value`, no YAML dep
        name        ← frontmatter.name ?? first '# ' heading ?? filename stem
        description ← frontmatter.description ?? first paragraph (≤ 300 chars)
        type        ← frontmatter.type if it is a SkillType, else 'custom'
        body        = markdown with the frontmatter stripped

.zip  → fflate.unzipSync(bytes)
        core = SKILL.md (any depth, shallowest wins) ?? skill.md ?? the only *.md
               ?? shallowest *.md
        every other member → ignored_entries[]  (directories skipped)
        warnings[] ← executable-looking members (.sh .bash .zsh .js .mjs .cjs .ts
                     .py .rb .php .pl .bat .cmd .ps1 .exe .dll .so .dylib .jar)
```

Limits: ≤ 512 KB decoded upload, ≤ 200 archive members, ≤ 2 MB uncompressed, core
≤ 256 KB. Members are read into memory only — nothing is written, extracted to disk
or executed, and member paths are never resolved against a directory. No markdown
member → 422 listing what was found. Unknown extension → 422.

### 5.4 Prompt wiring (`modules/reviews/run-executor.ts`)

Inside `runOneAgent`, before `reviewPullRequest`:

```ts
const skills = await this.agents.enabledSkillsForPrompt(agent.id);   // container.agentsRepo
blocks = skills.map((s) => `### ${s.name}\n${s.body.trim()}`)
runLog.info(`skill "${name}" attached (~${tokens} tokens)`)  // one line per skill
runLog.info(`skills: N attached (~T tokens total)`)          // or "no skills bound"
…(blocks.length ? { skills: blocks } : {})
```

Omit-when-empty keeps the prompt byte-identical to today for an agent with no
skills. Token counts come from `container.tokenizer` (js-tiktoken). The trace needs no
work: `assemblePrompt` already writes the joined block to `PromptAssembly.skills`.

## 6. Client

### 6.1 Files

```
src/lib/hooks/skills.ts                       useSkills · useSkill · useCreateSkill ·
                                              useUpdateSkill · useDeleteSkill ·
                                              useSkillAgents · useImportSkillPreview ·
                                              useAgentSkills · useSetAgentSkills
src/app/skills/page.tsx                       thin route → SkillsView
src/app/skills/_components/SkillsView/        header · search · Add Skill dropdown · grid
  └── _components/SkillCard/                  name · type chip · source badge · description ·
                                              toggle · used-by · delete
  └── _components/SkillDrawer/                preview ⇄ form (create + edit)
  └── _components/ImportSkillModal/           file picker → preview → confirm
src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/
                                              checkbox rows · drag + ↑↓ · filter · count
src/vendor/ui/nav.ts                          SKILLS LAB group (D9)
```

### 6.2 Behaviour

- **Card grid** — search filters name + description; toggle PUTs `enabled` only.
- **Drawer preview** — name, `vN`, type + source badges, "used by" agent names, the
  body as rendered markdown; a trust notice when `source !== 'manual'`.
- **Drawer form** — name (required), description with the hint *"Write it as a
  directive — what the agent must check and how. This is the skill's interface."*,
  type select, markdown body (`mono` textarea) with a `~N tokens` estimate. Save →
  POST / PUT; the drawer returns to preview.
- **Import modal** — pick `.md` / `.zip` → `POST /skills/import` → preview (editable
  name/description/type, read-only body, ignored + warnings lists) → *Import* →
  `POST /skills` with `source: 'imported_url'`.
- **Skills tab** — bound skills first (link order), then unbound (name asc). Checkbox
  toggles binding; drag or ↑/↓ reorders bound ones; every change PUTs the whole
  ordered set immediately. Globally disabled skills render dimmed with a *disabled*
  badge (they never reach the prompt).
- **Trace drawer** — every prompt block gets a `~N tokens` chip (`chars / 4`; the
  client has no tokenizer, hence the `~`).

## 7. Seed (`server/src/db/seed.ts` + `seed-skills.ts` + `docs/agent-prompts/`)

Idempotent by name (insert-if-missing, like the existing agents):

| Agent | Skills (type) |
|---|---|
| Test Quality Reviewer | `uncovered-branches` (rubric) · `boundary-and-corner-cases` (rubric) · `mocking-discipline` (convention) |
| API Contract Reviewer | `breaking-change-detector` (rubric) · `response-shape-compatibility` (convention) · `contract-first-changes` (convention) |

Prompts: `docs/agent-prompts/test-quality-reviewer.md`, `api-contract-reviewer.md`
(mirrored in `seed-prompts.ts`). Importable samples for the demo:
`docs/skills/flaky-test-patterns.md` and `docs/skills/route-versioning/` (a folder with
`SKILL.md` + `scripts/` to zip and import — the script is listed, never run).

## 8. Tests

- server-unit: `test/skills-helpers.test.ts` — frontmatter parsing, name/description
  fallbacks, zip core selection, ignored/warning lists, limits.
- server-integration (`*.it.test.ts`, self-skips without Docker):
  `test/skills.it.test.ts` — CRUD + version bump + used_by + agent binding + the
  run-executor prompt block (mock LLM captures the assembled prompt).
- client: `SkillsView.test.tsx`, `SkillDrawer.test.tsx`, `ImportSkillModal.test.tsx`,
  `SkillsTab.test.tsx` (hooks mocked, as `AgentEditor.test.tsx` does).

## 9. Acceptance criteria (EARS)

- **AC-1** When the user opens `/skills`, the system shall show every workspace skill
  as a card with its name, type, description and enabled toggle.
- **AC-2** When the user clicks a card, the system shall open a side drawer with the
  skill's rendered body; when the user clicks *Edit*, the same drawer shall show the
  form, and saving shall persist the change and return to the preview.
- **AC-3** When a skill's `name`, `description`, `type` or `body` is saved, the system
  shall increment its version and record a `skill_versions` snapshot; toggling
  `enabled` alone shall not.
- **AC-4** When the user creates a skill via *Add Skill → Create*, the system shall
  store it with `source = 'manual'`.
- **AC-5** When the user imports a `.md` or `.zip`, the system shall return a preview
  and persist nothing until the user confirms; every non-core archive member shall be
  listed as ignored and executable-looking ones flagged; no member shall be written
  to disk or executed.
- **AC-6** When the user checks a skill in an agent's Skills tab, the system shall bind
  it; when the user reorders bound skills, the prompt block order shall follow.
- **AC-7** When a review runs, the prompt shall contain a `## Skills / rules` section
  with one `### <name>` block per bound + enabled skill, in bound order, and the
  Live Log shall show one line per attached skill with its token estimate.
- **AC-8** When a bound skill is disabled (globally) or unbound, its block shall not
  appear in the prompt or the trace.
- **AC-9** When an agent has no bound + enabled skills, the assembled prompt shall be
  byte-identical to today's (no skills section, `prompt_assembly.skills = null`).
- **AC-10** When `pnpm db:seed` runs on a fresh DB, *Test Quality Reviewer* and *API
  Contract Reviewer* shall exist with their three skills bound; re-running shall not
  duplicate anything.

---

## 10. v2 — rail + tabbed editor, Stats (2026-09-21)

### 10.1 Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D10 | `/skills` is a **list rail + editor with tabs**, mirroring `/agents/[id]`: `/skills` auto-opens the first skill (name asc), `/skills/[id]?tab=` holds the tab. Empty workspace → rail with an empty state + *Add Skill*. | `SkillsView`/`SkillCard`/`SkillDrawer` (v1) are removed; `ImportSkillModal` moves under the rail. |
| D11 | Tabs are **Config · Preview · Evals · Stats · Versions** in that order. **Evals** and **Versions** are placeholders ("arrives with a later lesson") — the tab, the header's *Run on evals* button (it opens the Evals tab) and the `vN` badge ship; the features do not. | No eval / version-restore code in v2. `GET /skills/:id/versions` (v1) stays for the later lesson. |
| D12 | Stats are **real numbers or `—`**, never mocked. Attribution needs "which skills were in a run", recorded at run time in a new link table `agent_run_skills` (one migration; the owner's dev DB has no such table, so it applies cleanly). | `run-executor` writes the rows when it resolves the prompt blocks; the skills module reads them. *Findings by category* is out of scope (no donut). |
| D13 | Create = `CreateSkillModal` (name · description · type · body pre-filled with a template) → `POST /skills` → navigate to the editor. Delete lives at the bottom of Config (danger button, confirm lists the agents using it) → back to `/skills`. | — |
| D14 | The body editor keeps the design's look: `<name>.md` header, *unsaved* badge, token count, line-number gutter, headings tinted. Lines do **not** wrap (`white-space: pre`, horizontal scroll) so the gutter always aligns; the tint is a transparent `textarea` over a highlighted `<pre>` with identical metrics. | One new component, `SkillBodyEditor`; no editor library. |

### 10.2 Data model — `agent_run_skills` (new, migration)

```
agent_run_skills   run_id → agent_runs (cascade) · skill_id → skills (cascade) ·
                   skill_version int · position int · PK (run_id, skill_id) · index (skill_id)
```

Written by `ReviewRunExecutor.buildSkillBlocks` right after the bound + enabled
skills are resolved (before the LLM call), through `ReviewRepository.recordRunSkills`
— the reviews module owns `agent_runs`, so it owns this row too. Deleting a run or a
skill cascades; old runs (before v2) simply have no rows and count as "no skill".

### 10.3 Metrics (all over the last **30 days**, runs with `status = 'done'`)

| Metric | Definition | Empty case |
|---|---|---|
| Used by | agents currently binding the skill (`agent_skills`) | `0 agents` |
| Pull frequency | `runs that included the skill ÷ all runs in the workspace` | `—` when no runs |
| Accept rate | over findings of runs that included the skill: `accepted ÷ (accepted + dismissed)` (`findings.accepted_at` / `dismissed_at`) | `—` when nothing was acted on |
| Findings (30d) | findings (`kind = 'finding'`) produced by runs that included the skill | `0` |
| Agents using this skill | the bindings, with *Open* → `/agents/:id?tab=skills` | list empty state |

A run with N skills attributes its findings to each of the N — "findings from runs
that included this skill", not a per-skill split (the model does not say which rule
produced a finding).

### 10.4 Contracts (`vendor/shared/contracts/knowledge.ts`, both trees)

```ts
SkillSummary += pull_pct: z.number().nullable(), accept_pct: z.number().nullable()   // 0–100, rounded
SkillStats = z.object({
  used_by: z.number().int(),
  runs_30d: z.number().int(),
  runs_with_skill_30d: z.number().int(),
  pull_pct: z.number().nullable(),
  findings_30d: z.number().int(),
  accepted_30d: z.number().int(),
  dismissed_30d: z.number().int(),
  accept_pct: z.number().nullable(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
})
```

### 10.5 Server

- `GET /skills/:id/stats` → `SkillStats` (404 outside the workspace).
- `GET /skills` decorates every row with `pull_pct` / `accept_pct` from ONE grouped
  query over `agent_run_skills ⋈ agent_runs (⋈ reviews ⋈ findings)`.
- `ReviewRepository.recordRunSkills(runId, [{ skillId, version, position }])`.

### 10.6 Client

```
src/app/skills/page.tsx                       rail + redirect to the first skill / empty state
src/app/skills/[id]/page.tsx                  rail + SkillEditor (tab from ?tab=)
src/app/skills/_components/SkillsRail/        header · Add Skill ▾ · search · cards
  └── _components/{SkillRailCard, CreateSkillModal, ImportSkillModal}
src/app/skills/_components/SkillEditor/       header (type icon · name · type chip · vN · Run on evals) + Tabs
  └── _components/{ConfigTab, PreviewTab, EvalsTab, StatsTab, VersionsTab,
                   SkillBodyEditor, SkillMarkdown}
src/lib/hooks/skills.ts                       + useSkillStats
```

- **Rail card**: type-coloured icon box, mono name, enabled toggle, one-line
  description, type chip + source badge with icon (Manual / Extracted / Community /
  Imported), stats line `N agents · P% pull · A% accept` (`—` for nulls).
- **Shell**: `SkillsWorkspace` owns the rail + the create / import modals and hands
  the right column to the page as a render prop (`{ openCreate, openImport }`), so the
  landing's empty state opens the same modals as *Add Skill*.
- **Config**: `Configuration` + `vN` + Enabled; Name\* · Description (directive hint)
  · Type · Skill body\* (`SkillBodyEditor`); *Save skill* only when dirty, *Cancel*
  resets, `Saved (vN)` + toast; *Delete skill* (danger).
- **Preview**: "Rendered as the reviewing agent receives it." — `SkillMarkdown`
  (react-markdown + gfm with h1–h3 / lists / code / blockquote styling; the vendored
  `Markdown` primitive styles none of those and is left untouched).
- **Stats**: four tiles (Used by · Pull frequency · Accept rate with a ring · Findings
  30d) + "Agents using this skill" card.
- **Evals / Versions**: placeholder panels.

### 10.7 Tests

- server-unit: percentage helpers (`pct`), stats row → DTO mapping.
- server-integration (`skills.it.test.ts`): after a run with a grounded finding,
  `GET /skills/:id/stats` → `runs_with_skill_30d = 1`, `findings_30d = 1`; accepting
  the finding → `accept_pct = 100`; the list row carries `pull_pct`.
- client: `SkillsRail`, `ConfigTab` (dirty/unsaved/save/validation/delete),
  `SkillBodyEditor` (gutter + tokens + highlight), `PreviewTab`, `StatsTab` (tiles,
  `—`, agents list), `CreateSkillModal`, `[id]/page` tab routing smoke.

### 10.8 Acceptance criteria (v2)

- **AC-11** When the user opens `/skills` and skills exist, the system shall open the
  first skill (name asc) in the editor with the Config tab; when none exist, it shall
  show the rail's empty state with *Add Skill*.
- **AC-12** When the user clicks a rail card, the URL shall become `/skills/<id>?tab=<current tab>`
  and the editor shall show that skill; the card shall render its type, source, description
  and `agents · pull · accept` line.
- **AC-13** When the body or any config field changes, the editor shall show *unsaved*
  and enable *Save skill*; saving shall persist, bump the version on content changes and
  return to the clean state with `Saved (vN)`.
- **AC-14** When a review runs, the system shall record every skill that entered the
  prompt in `agent_run_skills`; the Stats tab shall then report that run, and `—`
  wherever a rate has no denominator.
- **AC-15** When the user opens Evals or Versions, the system shall show a placeholder
  that names the later lesson, and *Run on evals* shall open the Evals tab.

