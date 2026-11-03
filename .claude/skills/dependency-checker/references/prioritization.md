# Prioritization rubric

Turn each verified signal into exactly one priority. Decide by **impact × certainty**,
then tag effort and risk. Don't invent a fifth level.

| Priority | Meaning | Qualifies |
|---|---|---|
| **P0 — now** | Security or broken boundary | `vulnerable` high/critical on a **used** dep; `cross-package-relative` (a relative import into another package's source instead of its alias/public entry); a prod import with no matching dependency; `*`/`latest` on a prod dep |
| **P1 — this sprint** | Certain, valuable, cheap | verified `unused` (esp. Unique ≥ 5 MB); `range-drift`/`major-drift` of the same dep across packages (e.g. three `zod` versions — no workspace dedupes them); `dev-used-in-src` (breaks a prod install with `--omit=dev`) |
| **P2 — soon** | Hygiene, small payoff | `prod-only-in-tests`, `types-in-prod`, verified `unused` < 5 MB, `outdated-major` on prod deps, low/moderate dev-only vulns |
| **Info** | Watch / by design | `heavy` prod deps with no cheap alternative, `package-cycle`, `mixed-managers`, outdated dev tools, unverified signals ("needs human check") |

## Tie-breakers

1. Runtime (`prod`) beats `dev`; shipped surface (`client` bundle, `server` runtime) beats tooling.
2. Higher **Unique** bytes beats lower. Savings are only real if Unique > 0.
3. Certain beats probable: a grepped-and-confirmed `unused` outranks a `heavy` guess.
4. If two items conflict (e.g. dedupe `typescript` vs. a package that pins an old one), keep both
   but order by blast radius, smallest first.

## Effort and risk tags

| Tag | Effort | Typical |
|---|---|---|
| `S` | ≤ 30 min | remove one dep, move to devDependencies, align a range |
| `M` | ≤ half a day | major upgrade with green tests, swap a heavy lib for a lighter one |
| `L` | > half a day | replace a framework-level dependency, restructure the shared vendor copy |

Risk: `low` (no code change) · `med` (code change, tests cover it) · `high` (no test coverage, runtime-only path).

## Heavy-dependency playbook (Info unless proven otherwise)

Before suggesting "replace X", answer: what does it buy us, who imports it
(`imports_src`), is it client-only (code-splittable / `dynamic()`), and is a
lighter equivalent maintained? Common moves, in order of cost:

1. Lazy-load or `next/dynamic` it (client, e.g. a diagram renderer used on one page).
2. Import the sub-path / named icon set instead of the whole package.
3. Replace with a smaller library or a ~20-line local helper.
4. Accept it and record why in the package's `INSIGHTS.md`.

## What not to flag

- `typescript`, `tsx`, `vitest`, `@types/node` present in every package — that is the
  design (no workspace). Flag only version **drift**, not presence.
- Peers supplied by a framework (`react-dom` for `next`).
- Anything under `src/vendor/**`.
