---
name: dependency-checker
description: >-
  Audit every dependency in the DevDigest repo and its packages (server, client,
  reviewer-core, mcp, e2e, evals): draw the dependency graph in Mermaid (internal
  path-alias links vs external npm packages), measure what each dependency weighs
  on disk (own, closure, and what removal really reclaims), flag unused / misplaced /
  drifting / heavy / vulnerable / outdated ones, and finish with P0/P1/P2/Info
  findings and a short actionable summary. Use when asked to check, audit, review,
  slim down or visualise dependencies, "what is heavy in node_modules", "are we
  using everything we depend on", version drift between packages, or before adding
  a large dependency. Trigger terms: dependencies, deps audit, node_modules size,
  unused packages, dependency graph, outdated, npm audit, drift.
metadata:
  tags: dependencies, audit, size, graph, mermaid, npm, pnpm, workflow
---

# Dependency Checker

One structured report answers "what do we depend on, what does it cost, what
should we fix first?". A read-only script gathers facts; you verify and rank them.

## Report contract — exactly these 5 sections, in this order

| # | Heading | Content |
|---|---|---|
| 1 | `## 1. Scope` | which packages were analyzed (client, server, reviewer-core, mcp, e2e, evals), package manager each, prod/dev counts, what was *not* analyzed (not installed, offline, no audit) |
| 2 | `## 2. Dependency graph` | a fenced ```` ```mermaid ```` `flowchart` of packages — the diagram MUST start with the keyword `flowchart LR` (never the legacy `graph LR`). **Internal** links (tsconfig path alias, solid arrow; relative import, dashed) are drawn and labelled separately from **external** npm deps |
| 3 | `## 3. Size breakdown` | table per package: dependency · kind · version · size (own / closure / unique) · imports. Real numbers, never "it's large". Then shared deps and version drift |
| 4 | `## 4. Findings & Priorities` | findings grouped under `### P0`, `### P1`, `### P2`, `### Info` (omit none — write "none" if empty). Every finding names a package, a dependency or file, evidence, and a concrete proposed action |
| 5 | `## 5. Summary` | 3–5 takeaways ordered by priority, each actionable, with total reclaimable size |

Never reorder, rename or drop sections. Do not give generic advice ("consider
optimizing dependencies") — every line cites a package, dependency or file.

## Two ways to run

**A. Tools available (normal):**
1. From the repo root: `node .claude/skills/dependency-checker/scripts/scan.mjs --out .devdigest/cache/deps-report`
   (offline, ~2 s, read-only). Add `--online` only if the user wants audit/outdated
   — it needs network, say so first. `--top N` sets rows per package.
2. Read `deps-report.md` (sections 1–3 and the raw signals of 4a are ready) and `deps-data.json`.
3. Verify each signal you will act on with `rg` (see *Verification*), write 4b and 5,
   append them to the file, and reply with the section-2 graph, the P0/P1 list and
   the total reclaimable size. Don't paste the whole report.
4. If a package says "node_modules missing", tell the user to install it with **its
   own** manager; don't install for them.

**B. No tools / data supplied in the prompt:** the user (or a harness) pasted
manifests, `du` sizes and import greps. Treat it as already collected, build the
full 5-section report from it directly, and don't ask for tool access or more data.
State in Scope which numbers were supplied rather than measured.

## Repo facts you must respect

- **Not a monorepo / not a workspace.** Packages share code through tsconfig
  `paths` aliases (e.g. `@shared/*` → `server/src/vendor/shared`), never
  `workspace:*`. Don't say or imply pnpm/npm workspaces. Each package has its own
  manifest and lockfile; `server/`, `client/`, `evals/` use pnpm, the rest npm.
  The same dep in 3 packages is 3 installed copies — so version drift is a real finding.
- **Internal ≠ external.** Cross-package imports are *internal dependencies*; draw and
  discuss them apart from npm packages. A relative import that reaches into another
  package's source (`reviewer-core/src/pipeline.js`) instead of its public entry /
  alias is **P0** (it breaks the boundary, and nothing else catches it).
- A `reviewer-core ↔ server` cycle caused by the vendored `shared` dir is known;
  report it as Info, don't fix it unprompted.
- Never edit manifests, lockfiles, `src/vendor/**`, `server/clones/**` while acting
  on this skill. **Recommendations are proposals for the user to confirm** — say
  "recommend removing `moment` from `server/package.json`", never "I removed it".

## Size vocabulary

- **Own** — the package dir. **Closure** — own + transitive runtime deps (peers excluded).
  **Unique** — closure minus what other direct deps share = what removal truly
  reclaims; quote *Unique* for savings. Tiers: 🔴 ≥20 MB · 🟠 ≥5 MB · 🟡 ≥1 MB · 🟢 <1 MB.
- Sizes are installed bytes on disk, not bundle size — say so for client deps.

## Verification (before any "unused" / "misplace" finding)

`rg -n "<name>" <pkg> --glob '!node_modules' --glob '!dist'`, plus the package's
scripts and top-level config. Look for dynamic `require`, plugins referenced by
string (postcss/vitest/next), peers (`react-dom` for `next`), `@types/*` pairs.
Can't confirm → put it in Info as "needs human check". In mode B the supplied
grep output is your verification: "no import found under `server/src`" is enough.

## Priorities (full rubric: [`references/prioritization.md`](references/prioritization.md))

| Tier | Use for |
|---|---|
| **P0** | security (high/critical vuln on a used dep), broken boundary (relative import into another package), prod import with no declared dep, `*`/`latest` on prod |
| **P1** | verified unused with real savings, version drift across packages, `dev-used-in-src` |
| **P2** | hygiene: misplaced dev/prod, `@types/*` in prod, small unused, outdated majors |
| **Info** | heavy-but-justified deps, known cycle, mixed managers, by-design duplication |

Layout of 4 and 5: [`references/report-template.md`](references/report-template.md);
a filled example: [`examples.md`](examples.md).
