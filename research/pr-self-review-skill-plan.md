# PR Self-Review — Skill Plan (for review, not built yet)

> Status: **DRAFT PLAN**. This document describes *what would go into* a new
> `pr-self-review` skill so we can agree on the design before writing any of it.
> No skill files are created yet.

## 1. Purpose

A single **orchestration skill** that reviews every pending change **locally,
before a pull request is opened** (and on demand). It does not invent new lint
rules — it routes the diff to the skills we already have, unifies their findings
under one severity scale, and **blocks the PR when anything CRITICAL is found**.

Think of it as a local, pre-PR echo of what the DevDigest reviewer does on the
server side: catch the problem on your machine before GitHub ever sees it.

Key property: **zero new rules of its own.** All substance comes from the
existing skills; this skill owns only *diff bucketing → gates → routing →
severity unification → block decision → report*. That is what keeps it from
duplicating `react-best-practices`, `onion-architecture`, etc.

## 2. When it runs

Two entry points:

1. **Before a GitHub-mutating action (the gate).** Whenever we are about to
   `gh pr create` / push a branch that will become a PR, run this first. The
   skill `description` must be deliberately "pushy" so it self-triggers on
   phrases/intents like *open a PR, create pull request, push this branch, ready
   to merge, ship this*.
2. **Manual** — `/pr-self-review` at any time to check the working tree.

> ⚠️ **Enforcement honesty (decision D2).** A skill is a set of instructions to
> Claude, not a kernel-level lock — the "block" means *Claude refuses to open
> the PR and reports the blockers*. That is reliable inside this app (PR creation
> goes through Claude), but a determined `git push` from a terminal bypasses it.
> If we want a *hard* gate we additionally wire a `pre-push` hook or a CI job
> that runs the same checks. Options are in §9.

## 3. What "all open changes" means (decision D1)

Default proposal: review **everything the PR would introduce** —

- committed on this branch vs. the base: `git diff --merge-base main`
- **plus** staged and unstaged working-tree changes (so WIP is checked too).

Alternative: only committed-vs-base (cleaner, but misses uncommitted work). The
user's phrasing ("всі відкриті зміни") points at including the working tree, so
that is the default unless we decide otherwise.

**Always excluded from review** (per root `AGENTS.md` "Do not touch"):
`**/vendor/**` (except a deliberate contract change — see §5 shared bucket),
`**/node_modules/**`, `pnpm-lock.yaml`, `package-lock.json`,
`server/src/db/migrations/**` (generated), `server/clones/**`.

## 4. Two-tier gate

### Tier 1 — deterministic checks (fast, zero false positives)

Run the repo's own tooling on the affected packages. Any failure is an
**automatic BLOCK** — these are unambiguous. Respect the supply-chain gate:
**never** `pnpm typecheck|install|db:migrate`; call the binaries directly.

| Package touched | Commands (run from that package dir) |
| --- | --- |
| `client/` | `./node_modules/.bin/tsc --noEmit` · `./node_modules/.bin/vitest run` · `./node_modules/.bin/next build` (or lint-only — see D5) |
| `server/` | `./node_modules/.bin/tsc --noEmit` · `./node_modules/.bin/vitest run` (hermetic only; `*.it.test.ts` need Docker → skip when down) · `pnpm arch:check` (dependency-cruiser = onion boundaries) |
| `reviewer-core/` | `npm run typecheck` · `npm test` (this package uses **npm**) |
| `e2e/` | `npm run e2e:hermetic` — heavy; probably **not** in the fast gate (D5) |

`arch:check` is the important one: it turns the whole `onion-architecture` skill
into a deterministic pass/fail for import-boundary violations.

### Tier 2 — LLM skill review

For each changed file, apply the routed skills' rules (below) and emit findings.
Only the **changed hunks/lines** are reviewed, so pre-existing debt outside the
diff never blocks the PR.

## 5. Diff → skill routing

| Bucket | Path globs (changed files only) | Skills applied |
| --- | --- | --- |
| **Frontend UI** | `client/src/**/*.{ts,tsx}` excl. `vendor/**` and `*.test.*` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security` (frontend subset) |
| **Frontend tests** | `client/src/**/*.test.{ts,tsx}` | `react-testing-library` |
| **Backend app / domain** | `server/src/**` excl. `vendor/**`, `db/migrations/**`; `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `typescript-expert`, `zod`, `security` (backend subset) |
| **DB schema** | `server/src/db/schema*.ts` | `postgresql-table-design`, `drizzle-orm-patterns` |
| **Shared contracts** | `*/vendor/shared/**` (deliberate contract change) | `zod`, `typescript-expert`, + the **"edit both trees identically"** rule |
| **Cross-cutting** | every reviewed `*.{ts,tsx}` | `security`, `typescript-expert` |

Notes that must live in the skill:
- `next-best-practices` is `user-invocable: false` → the orchestrator loads its
  files by path, it can't be reached via a slash command.
- **Shared-contracts gotcha:** contracts are hand-copied into
  `server/src/vendor/shared/` **and** `client/src/vendor/shared/`. If a change
  touches one tree and not the other → finding (they drift silently otherwise).
- **`security` skill is written for Express/Mongo/JWT; our stack is
  Fastify/Postgres/Drizzle.** The skill must translate OWASP categories to our
  stack (SQL/Drizzle injection, Fastify auth hooks, secrets in
  `~/.devdigest/secrets.json`) and **not** fire Mongo-only rules
  (`$where`, operator injection, `mongo-sanitize`) that don't apply here.

## 6. Unified severity + the block decision (the crux)

Because the skills disagree on vocabulary, the orchestrator maps every finding
into **one** scale. Proposal: reuse DevDigest's own product enum
`Severity = CRITICAL | WARNING | SUGGESTION` (dogfooding — the same words the
team already reads in the app). Decision D4 if we'd rather keep 4 levels.

| Our level | Blocks? | What lands here |
| --- | --- | --- |
| **CRITICAL** | **YES** | Any Tier-1 failure (tsc / test / build / `arch:check`); `security` CRITICAL or high-confidence HIGH (auth bypass, injection, committed secret, missing authz on a route/Server Action); `react-best-practices` CRITICAL (index/unstable keys on dynamic lists, render factories, derived-state-via-effect that shows wrong UI, impure component); `onion-architecture` violations (Drizzle in route/service, domain importing outward, I/O not via a port, contract not changed shared-first); shared-contract drift; a boundary `any`/unsafe cast that defeats a contract |
| **WARNING** | no (listed + must be acknowledged) | perf/maintainability: `react` HIGH, `security` MEDIUM, missing test for changed logic, non-idiomatic Fastify/Drizzle/Zod, oversized component, business logic in a route file that still compiles |
| **SUGGESTION** | no | MEDIUM/LOW, style, naming, organization niceties |

Mapping rules the skill states explicitly:
- **Honor a skill's own CRITICAL tag** when it has one (`react-best-practices`,
  `security`, `zod`).
- For skills with **no** taxonomy (`onion`, `frontend-ui-architecture`,
  `drizzle`, `typescript-expert`, `fastify` NEVER-rules) classify with a short
  heuristic: *ships a bug / vuln / broken build / arch-lint failure → CRITICAL;
  works but slows or confuses → WARNING; taste → SUGGESTION.*

**Gate:** `≥1 CRITICAL ⇒ 🔴 BLOCKED` (refuse to open the PR, present blockers +
fixes). Otherwise `🟢 PASS` or `🟡 PASS WITH WARNINGS`. Explicit override path:
the user can say "open anyway" (advisory design — see D2). Optional D6: also
block when WARNINGS exceed a threshold.

## 7. False-positive guardrails (so the gate is trusted)

A gate people don't trust gets ignored. So the skill must:
- Honor each skill's own "do NOT flag" lists — especially `security`'s
  confidence model (skip tests, dead code, server-controlled values,
  framework-mitigated patterns; report only HIGH-confidence).
- Review **changed lines only**, never whole files.
- Require every finding to carry **file:line + why + fix + which skill/rule** —
  no vague blocks. A CRITICAL with no reproduction path is downgraded.
- Skip the excluded paths from §3 up front.

## 8. Output — a fixed report template

```
PR Self-Review — <branch> → main
Verdict: 🔴 BLOCKED (2 critical) | 🟡 PASS WITH WARNINGS (0 critical, 5 warnings) | 🟢 PASS
Tier 1: tsc ✓  vitest ✓  next build ✓  arch:check ✗
Buckets reviewed: Frontend UI (4 files), Backend (2), Shared (1)

CRITICAL
  server/src/modules/pulls/routes.ts:41 · onion-architecture/R2
    Route imports drizzle-orm directly — DB access must live in a repository.
    Fix: move the query into pulls/repository/*.repo.ts and call it from the service.

WARNING
  client/src/app/.../Foo.tsx:88 · react-best-practices/HIGH
    New object created inline in a memoized child's prop — breaks React.memo.
    Fix: hoist to a module constant or useMemo.

SUGGESTION
  ...
```

Findings grouped by severity then file; mirrors the product's finding shape
(file, line, severity, category, message, fix) so it reads familiarly.

## 9. Files we would create (later, once this plan is approved)

```
.claude/skills/pr-self-review/
├── SKILL.md            # orchestration: triggers, flow, gate, severity, report template
├── README.md           # focus, coverage, relation to other skills, version (per our convention)
└── references/
    ├── routing.md            # path→skill glob table (single source of truth)
    ├── severity-rubric.md    # the mapping in §6, with per-skill notes
    ├── deterministic-checks.md  # exact per-package commands + supply-chain-gate caveats
    └── report-template.md    # the §8 format
```

Optional helper scripts (deterministic, keep every run identical):
- `scripts/collect-diff.sh` — changed files vs merge-base + working tree, minus excludes.
- `scripts/run-gates.sh` — run Tier-1 checks only for affected packages.

Orchestration style (decision D3):
- **A (recommended): subagent fan-out** — one review agent per bucket (Frontend,
  Backend, Cross-cutting), each loads its routed skills, reviews only its files,
  returns structured findings. Isolates context, faster, mirrors DevDigest's own
  multi-agent reviewer. Kept modest (2–4 agents).
- **B: inline sequential** — Claude reviews bucket by bucket. Simpler, slower,
  heavier context on large diffs.

## 10. Relationship to existing skills (non-duplication)

- **Orchestrator, not a rulebook.** Contributes zero new lint rules; every
  finding is attributed to an existing skill + rule.
- Complements `engineering-insights` (run *after* a change) — this runs *before
  the PR*.
- Local counterpart to the DevDigest server-side reviewer.

## 11. Open decisions for you to confirm

| # | Decision | Default proposal |
| --- | --- | --- |
| D1 | Diff scope | vs-base **+** working tree (staged+unstaged) |
| D2 | Enforcement strength | Advisory (Claude refuses) now; offer a `pre-push`/CI hard gate as opt-in |
| D3 | Orchestration | Subagent fan-out (2–4 agents) |
| D4 | Severity vocabulary | Reuse product's `CRITICAL/WARNING/SUGGESTION` |
| D5 | Tier-1 heaviness | tsc + vitest + arch:check always; `next build` yes/no; e2e out of the fast gate |
| D6 | Warnings threshold | CRITICAL-only blocks; warnings never block (no count threshold) |
| D7 | Auto-run trigger | Only when a PR will be opened, not on every WIP push (avoid nagging) |

---

## 12. Enhancements to make it *much* better

Priorities: **P0** = build into v1 (this is what makes it good), **P1** = strong
follow-up, **P2** = later. Cost noted where it matters.

### A. Trigger better (so it actually fires before every PR)

- **[P0] Phrase-rich, "pushy" description.** Skill triggering is driven almost
  entirely by the `description`. It must name the intents explicitly: *open a
  PR, create pull request, `gh pr create`, push this branch, ready to merge, ship
  it, is this ready, review my changes before I push*. Claude tends to
  *under*-trigger skills, so err on the pushy side. After v1, run the
  skill-creator's **description-improver** pass to tune trigger-rate empirically.
- **[P0] Negative triggers.** Say when **not** to run — docs-only diff, a diff
  with no code files, a WIP checkpoint the user explicitly labels — so it never
  nags. Reliability is as much about *not* firing wrongly as firing.
- **[P1] Hook-backed hard trigger (belt-and-suspenders for D2).** A Claude Code
  `PreToolUse` hook matching `gh pr create` / `git push`, or a git `pre-push`
  hook, that invokes (or refuses until) the review. This is what turns the
  advisory gate into a real one without relying on Claude remembering.
- **[P0] Cheap pre-flight.** First step is a fast "is there anything to review?"
  (empty diff → exit immediately). If running is always cheap when there's
  nothing to do, always-run is painless.

### B. Review better (quality, trust, fewer false blocks)

- **[P0] Adversarial verification pass — the single biggest quality lever.**
  Two stages: (1) reviewers emit *candidate* findings; (2) a separate **verifier**
  agent tries to **disprove** every CRITICAL — trace the data flow, confirm the
  bug/exploit is real, check for an upstream mitigation — before it's allowed to
  block. Only **CONFIRMED** criticals block; the rest downgrade to "verify
  manually". This is exactly the DevDigest/ultrareview pattern and it kills the
  false-positive blocks that make gates get ignored. Cost: ~doubles agent count
  on criticals only (verify runs per-finding, not per-file).
- **[P0] Grounding / evidence requirement.** Every finding must quote the actual
  offending line **and** give a concrete failure scenario (input → wrong
  output/crash), not just a rule name. An ungrounded CRITICAL auto-downgrades.
  (This is what `reviewer-core` calls "grounding".)
- **[P0] Repo-specific tripwires — the biggest *added* value.** These are
  DevDigest's real recurring bugs that **no single skill catches** because they
  are cross-file:
  - **Contract drift:** a change to `server/src/vendor/shared/**` without the
    identical change to `client/src/vendor/shared/**` (hand-copied trees).
  - **snake_case ↔ camelCase mapping:** a new contract field (`snake_case`) with
    no matching Drizzle `camelCase→snake column` mapping, or vice-versa — AGENTS.md
    calls this "the single most common bug when you add a field".
  - **Enum-casing:** a `Severity` (UPPERCASE) / `FindingCategory` (lowercase)
    value in the wrong case — fails Zod at runtime, not at compile time.
  - **Schema change without a migration** (`db/schema.ts` edited, no
    `db:generate` output), or a hand-edited file under `db/migrations/**`.
  - **New route / Server Action without auth + authz + Zod validation**
    (onion R4 + security A01).
  - **Wrong package manager / supply-chain-gate command** reintroduced in a
    script or doc (`pnpm typecheck|install|db:migrate`).
  Encode these as first-class checks with fixed messages.
- **[P0] Full-context reviews, not file-in-isolation.** Give each reviewer the
  whole changed file plus the symbols it imports/calls, so it doesn't hallucinate
  missing context. (We hit exactly this earlier: an icon-only button flagged as
  missing `aria-label` when the label was on the next line.)
- **[P1] Confidence ×severity.** Carry a confidence per finding; only
  high-confidence criticals block, medium-confidence criticals become "must
  verify" (never hard-block on a guess) — straight from the `security` skill.
- **[P1] De-dup + rank.** Collapse the same issue reported by multiple skills;
  order most-severe-first; cap suggestion noise (top N). A wall of nits erodes
  trust as fast as a false block.
- **[P1] Test-coverage delta.** Changed logic (a hook/service/repository) with no
  new/updated test → WARNING. Ties to `react-testing-library` + the project's
  test-split conventions.

### C. Better overall (actionable, fast, self-improving)

- **[P0] Auto-fix loop.** For each CONFIRMED critical, propose a concrete patch;
  optionally apply → re-run the gate until green (the code-review "Auto-fix"
  flow). Turns "🔴 BLOCKED" into "fixed and passing".
- **[P0] Machine-readable output + exit code.** Emit a JSON findings artifact and
  a non-zero exit on block, so the **same** skill backs both the chat report and
  a CI job / `pre-push` hook (this is what makes D2's hard gate cheap — one brain,
  two surfaces).
- **[P1] Incremental caching.** Cache findings keyed on file-content hash;
  re-running after a small fix only re-reviews what changed. Fast iterate loop.
- **[P1] Budget/scale controls.** For a large diff, chunk by bucket and cap
  agents/tokens so a 60-file PR stays fast and cheap (matches the workflow-size
  guideline).
- **[P1] Every finding explains *why*** + links its skill rule, so the author
  learns, not just obeys.
- **[P2] `engineering-insights` handoff.** When a review surfaces a novel
  gotcha, offer to record it in the right `INSIGHTS.md` — closes the loop with
  the existing workflow skill.

## 13. How we keep making it better (self-eval harness) — [P1]

Ship a tiny eval set with the skill so "better" is measurable, not vibes:
- a **known-good** diff (must PASS — measures false-positive rate),
- a diff with a **planted CRITICAL** (must BLOCK, must name it — measures recall),
- a **false-positive-bait** diff (aria-label on the next line, a server-controlled
  value that looks like user input — must NOT block — measures precision),
- a **trigger** eval (a "ready to open a PR" prompt with no skill named — must
  self-trigger).

Then use the skill-creator loop (with-skill vs baseline) to track trigger-rate,
precision and recall across iterations. This is the mechanism that takes it from
good to *much* better over time.
```
