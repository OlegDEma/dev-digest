# Tier-1 deterministic checks

The high-signal, zero-false-positive half of the gate: the repo's own tooling.
Any failure is a **CRITICAL** with no verification needed — a red `tsc` is a fact.
`scripts/run-gates.sh` runs exactly these for the affected packages only.

## The supply-chain gate — why we call binaries directly

In `server/` and `client/`, `pnpm typecheck`, `pnpm install` and `pnpm db:migrate`
abort with `ERR_PNPM_IGNORED_BUILDS` **before doing any work**. So the gate never
uses those pnpm scripts — it calls the tool binaries directly. `reviewer-core/`
and `e2e/` use **npm** and are not gated, so `npm run …` is fine there. Evidence:
root `AGENTS.md` → Conventions; `server/INSIGHTS.md` → Recurring Errors & Fixes.

## Exact commands per package

Run only for packages that have changed files.

| Package | Typecheck | Tests | Build / arch |
| --- | --- | --- | --- |
| `client/` | `./node_modules/.bin/tsc --noEmit` | `./node_modules/.bin/vitest run` | `./node_modules/.bin/next build` (slowest — toggle with `SKIP_BUILD=1`) |
| `server/` | `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | `./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'` | `arch:check` **only if wired** (see below) |
| `reviewer-core/` | `npm run typecheck` | `npm test` | — (build == typecheck here) |
| `e2e/` | `npm run typecheck` | — (`e2e:hermetic` is heavy; **out of the fast gate** — run manually) | — |

Notes:

- **Server integration tests** (`*.it.test.ts`) need a testcontainers Postgres
  (Docker). They are excluded from the fast gate; they run in CI
  (`server-integration.yml`, self-skips without Docker). If Docker is up and the
  diff touches DB code, running them is a good manual extra.
- **`vitest run`** without a filter would try every test; the server exclude keeps
  the gate hermetic and fast.

## arch:check (onion boundaries) — conditional

The `onion-architecture` skill describes a `pnpm arch:check` (dependency-cruiser)
CI step, and `depcruise` **is** installed (`server/node_modules/.bin/depcruise`).
But **the `arch:check` script is not wired in `server/package.json` yet**, and
there may be no ruleset config. So the gate treats it as optional:

- If `server/package.json` has an `arch:check` script → run `pnpm arch:check`
  (a plain script, not one of the three gated commands).
- Else if a dependency-cruiser config exists (`.dependency-cruiser.{js,cjs,json}`)
  → run `./node_modules/.bin/depcruise --config <cfg> --validate src`.
- Else → **skip**, and note in the report: *"onion boundaries checked by the
  reviewer only — arch:check not wired."* The Backend reviewer + the grep
  fallbacks in `onion-architecture/references/enforcement.md` still cover it.

Wiring `arch:check` later turns the whole onion skill into a deterministic
pass/fail — worth doing, but out of scope for this skill to install.

## Machine-readable result + hard gate (opt-in)

`run-gates.sh` exits non-zero if any check fails and prints a one-line summary per
check, so the same logic can back a hard gate the user opts into:

- **git `pre-push` hook** — `.git/hooks/pre-push` running `run-gates.sh` (Tier-1
  only; the LLM tiers stay in the interactive skill). Fast, blocks a raw push.
- **Claude Code hook** — a `PreToolUse` hook matching `gh pr create` / `git push`
  that invokes this skill.
- **CI job** — a workflow that runs `run-gates.sh` and, optionally, the full
  review from `pr-self-review.json`.

None of these are installed by the skill — they change the user's environment, so
they are offered, not auto-wired. A ready-to-copy `pre-push` hook lives at the end
of this file.

### Ready-to-copy pre-push hook (Tier-1 only)

```bash
#!/usr/bin/env bash
# .git/hooks/pre-push — Tier-1 deterministic gate. Make executable: chmod +x
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
bash "$root/.claude/skills/pr-self-review/scripts/run-gates.sh" || {
  echo "❌ pre-push blocked by pr-self-review Tier-1 checks. Fix, or push with --no-verify to override." >&2
  exit 1
}
```
