# Routing, severity, mode

The tables the review runs on. Agent and human both read this; the scripts read
the config block, so the `mode` a human sets here is the `mode` CI enforces —
there is no second source to drift from.

## Config (machine-read — the first `json` block is parsed by the scripts)

```json
{
  "mode": "report-only",
  "base": "main",
  "caps": {
    "max_review_agents": 4,
    "max_findings_per_slice": 40,
    "max_suggestions_shown": 10
  }
}
```

`mode` — `report-only` (ships this way; nothing is blocked, the report says what
*would* have been) or `blocking` (a confirmed CRITICAL refuses the PR). Flipping
it is a **major** version bump with a CHANGELOG entry, because it is the one line
that decides whether this skill can stop someone's work. The mode is copied into
each stamp; validators read it from there, so a flip never re-judges an existing
review.

## Slices

The diff is cut into slices; one reviewer owns each non-empty slice. `caps` bound
the fan-out and the noise.

| Slice | Changed files it claims | Skills the reviewer loads (`.claude/skills/<name>/SKILL.md`) |
| --- | --- | --- |
| **frontend** | `client/src/**/*.{ts,tsx}` — not `vendor/**`, not `*.test.*` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod` (if it touches contracts) |
| **frontend-tests** | `client/src/**/*.test.{ts,tsx}` | `react-testing-library` |
| **backend** | `server/src/**` — not `vendor/**`, `db/migrations/**`, `db/schema*`; and `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `typescript-expert`, `zod` |
| **schema** | `server/src/db/schema*.ts`, `server/src/db/schema/**` | `postgresql-table-design`, `drizzle-orm-patterns` |
| **contracts** | `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | `zod`, `typescript-expert` |

Fold small slices into their neighbour so the run stays at ~2–4 agents:
frontend+frontend-tests → one Frontend reviewer; backend+schema+contracts → one
Backend reviewer. Every slice also runs the tripwires
([`references/repo-tripwires.md`](references/repo-tripwires.md)) — that is where
the cross-file bugs and the security-relevant checks (auth, secrets) live.

**Excluded from every slice** (the collector strips them):
`**/node_modules/**`, lockfiles, `server/clones/**`,
`server/src/db/migrations/**` (generated — editing one is tripwire T4),
`**/*.md` / `docs/**` / `specs/**` (no code gate), and `vendor/**` **except**
`vendor/shared/**` (a deliberate contract change → the contracts slice).

## What is not routed, on purpose

- **The `security` skill.** It assumes Express + MongoDB + Mongoose; this stack is
  Fastify + Drizzle/Postgres, so its examples do not match the code under review
  and its Mongo rules (`$where`, operator injection) fire on nothing real. The
  security surface that *does* apply — missing auth on a route, a committed secret,
  SQL/Drizzle injection — is caught by tripwires T5/T8 and by the Fastify/Drizzle
  skills, and the harness `/security-review` command is the dedicated pass.
- **Bug-finding at large.** `/code-review` and `/security-review` already exist to
  find bugs. This skill routes, unifies severity, and decides; it does not
  reimplement them. (It cannot launch `/code-review` itself — that is user-run and
  billed — so it names them as the complementary pass, not a step it automates.)

## Severity scale — the gate owns it

Three skills here define severity and disagree; ten define none. Mapping between
their vocabularies is guesswork, so reviewers classify against **this one table**,
whatever the source skill calls its levels.

| Level | Blocks (in `blocking` mode)? | It means |
| --- | --- | --- |
| **CRITICAL** | yes | Ships a defect: a correctness bug, a security hole, a broken build, or an architecture-boundary break. |
| **WARNING** | no | Works, but degrades — perf, maintainability, a missing test for changed logic, logic in the wrong layer that still compiles. |
| **SUGGESTION** | no | Taste: naming, minor placement, optional simplification. |

**The load-bearing rule:** a CRITICAL must state a concrete production
consequence — the input/state and the resulting wrong output, crash, or exposure.
Without it, "violates the layering convention" would block merges, and the gate
would be deleted within a week. A finding that cannot name the consequence is not
a CRITICAL; drop it one level. Deterministic Tier-1 failures (tsc/tests/build) are
the exception — a red check is a fact, already grounded.

Mapping the sources: honor a skill's own CRITICAL tag, then translate —
`react-best-practices` CRITICAL (broken reconciliation) → CRITICAL; its HIGH
(perf) → WARNING. `onion-architecture` boundary violation → CRITICAL. A tripwire
hit → its stated level (most are CRITICAL). For a skill with no taxonomy, ask the
consequence question above.

**Confidence** rides alongside and decides whether a CRITICAL may block: only a
CRITICAL that survives verification ([`references/verification.md`](references/verification.md))
blocks; an unconfirmed one is reported as "flagged, verify manually" and does not.
A rule violated on a line the PR did not touch is at most a SUGGESTION — the gate
judges *this change*, not the repo's history.

## Waivers

A finding can be waived with a reason; the ledger and the three-strike rule are in
[`waivers.md`](waivers.md).
