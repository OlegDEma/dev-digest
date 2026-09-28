# Repo tripwires — DevDigest's cross-file bugs

These are the failure modes that **compile fine and pass file-local review**, so
no single skill catches them — they need a diff-wide view. This is the gate's
biggest *added* value. Each entry: how to detect, severity, and the fix. Run these
in step 2 of the workflow, over the changed-file set from `collect-diff.sh`.

Evidence throughout: root `AGENTS.md` (Conventions / Naming / Gotchas), root and
`server/INSIGHTS.md`.

## T1 — Contract drift between the two `vendor/shared` trees — CRITICAL

Contracts are **hand-copied** into `server/src/vendor/shared/` (canonical) **and**
`client/src/vendor/shared/` (copy) with no sync script. A change to one tree
without the identical change to the other drifts silently.

- **Detect:** the diff touches `server/src/vendor/shared/**` XOR
  `client/src/vendor/shared/**` (one side only), or touches both but with
  non-matching hunks for the same schema.
- **Fix:** apply the same change to both trees in this PR.

## T2 — snake_case ↔ camelCase mapping gap — CRITICAL

"The single most common bug when you add a field." Contract fields and API JSON
are `snake_case` (`cost_usd`, `start_line`); Drizzle names a `camelCase` property
mapped to a `snake_case` column (`startLine: integer('start_line')`); the
repo/route layer maps between them.

- **Detect:** a new field added in one of {`@devdigest/shared` contract, Drizzle
  schema, the repo/route mapping} but not the others. E.g. a contract gains
  `foo_bar` but no `fooBar` appears in the schema, or a schema column has no
  mapping to its `snake_case` contract field.
- **Fix:** add the field in all three places, keeping the casing convention
  (contract `snake_case` ↔ Drizzle `camelCase`→`snake_case` column ↔ explicit map).

## T3 — Enum casing — CRITICAL

Enum casing is **per-enum**: `Severity` is UPPERCASE
(`CRITICAL | WARNING | SUGGESTION`), `FindingCategory` is lowercase
(`bug | security | perf | style | test`). Both persist as plain `text`, so a
wrong-case value fails **Zod at runtime**, not at compile time.

- **Detect:** a literal assigned to a `Severity`/`FindingCategory` field in the
  wrong case (e.g. `severity: "critical"` or `category: "Bug"`), in changed code.
- **Fix:** match the enum's casing exactly.

## T4 — Schema change without a migration (or a hand-edited migration) — CRITICAL

Migrations are **generated**, do not run on boot, and must not be hand-written.

- **Detect (a):** the diff changes `server/src/db/schema*.ts` (or `db/schema/**`)
  but adds **no** file under `server/src/db/migrations/`. → the migration was not
  generated (`pnpm db:generate`).
- **Detect (b):** the diff **edits an existing** file under
  `server/src/db/migrations/**`. → a hand-edited generated file.
- **Fix:** change `schema.ts`, then `cd server && pnpm db:generate` to emit the
  migration, `pnpm db:migrate` to apply. Never hand-edit migrations.

## T5 — New route / Server Action without auth + authz + validation — CRITICAL

Onion R4 + security A01. A public entry point that skips any of the three is an
access-control hole.

- **Detect:** a new Fastify route (`server/src/modules/*/routes.ts`) or a
  `"use server"` action added in the diff that lacks: a Zod schema on
  `params`/`body`/response (validation at the rim), an auth/tenancy check, **and**
  an ownership/authorization check for the specific object.
- **Fix:** declare the schema from `@devdigest/shared`, authenticate, and
  authorize the specific resource before acting.

## T6 — Supply-chain-gate command reintroduced — CRITICAL (build breaker)

`pnpm typecheck` / `pnpm install` / `pnpm db:migrate` abort with
`ERR_PNPM_IGNORED_BUILDS` in `server/` + `client/`.

- **Detect:** any of those three commands added to a `package.json` script, a CI
  workflow (`.github/workflows/**`), a `scripts/**` file, a `Makefile`, a
  `Dockerfile`, or a doc that tells someone to run them in `server/`/`client/`.
- **Fix:** call the binary directly (`./node_modules/.bin/tsc --noEmit`,
  `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsx src/db/migrate.ts`).

## T7 — Destructive DB reset reintroduced — CRITICAL

- **Detect:** `docker compose down -v` (or `docker-compose down -v`) added to any
  script/doc/CI. `-v` destroys the `devdigest_pgdata` volume and every imported
  repo + review.
- **Fix:** never `-v`. Reset without destroying the volume.

## T8 — Committed secret — CRITICAL

Secrets live in `~/.devdigest/secrets.json` (mode 0600) / `process.env`, never in
git or the DB.

- **Detect:** a changed file adds a value matching the secret patterns in
  `security/SKILL.md` → Secret Detection (AWS `AKIA…`, Google `AIza…`, GitHub
  `gh[ps]_…`, npm `npm_…`, Slack `xox…`, `-----BEGIN … PRIVATE KEY-----`, a Postgres
  URI with inline credentials, or `(secret|key|token|password)\s*[:=]\s*['"][^'"]{8,}`),
  or adds a tracked `.env` / `.env.*` file.
- **Fix:** move it to `~/.devdigest/secrets.json` / env; if it was ever committed,
  rotate it.

## T9 — Wrong package manager in a package — WARNING

`server/` + `client/` use **pnpm**; `reviewer-core/` + `e2e/` use **npm**; each has
its own lockfile.

- **Detect:** a changed script/doc/CI runs `npm …` inside `server/`/`client/` or
  `pnpm …` inside `reviewer-core/`/`e2e/`; or a second lockfile appears in a
  package.
- **Fix:** use the package's own manager; keep one lockfile per package.

---

Most tripwires are grep-detectable — the reviewer should run the concrete pattern,
then **read the surrounding code to confirm** before flagging (a match in a test
fixture or a comment is not a bug). Ground each hit with the offending line and a
one-line failure scenario, per the verification bar.
