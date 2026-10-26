# Enforcement — keeping the onion honest

Import discipline that lives only in a doc rots. We enforce the ring boundaries
with **dependency-cruiser** (already a `server/` devDependency, `^17.4.3`, used
today for repo-intel import graphs) wired into CI, plus fast `grep` checks for a
human sweep, plus a repeatable recipe for un-leaking a module.

## 1. The dependency-cruiser ruleset

Create `server/.dependency-cruiser.cjs` with the rules below. Each rule maps 1:1
to a rule in `../SKILL.md`. `severity: "error"` fails CI; use `"warn"` only for a
deviation you are actively paying down (see `pulls/` note at the end).

```js
// server/.dependency-cruiser.cjs
// Onion-architecture boundaries. Each forbidden rule maps to a rule in
// .claude/skills/onion-architecture/SKILL.md. Run via `pnpm arch:check`.
module.exports = {
  forbidden: [
    {
      name: 'domain-stays-pure',
      comment: 'Rule 1 — reviewer-core is the center; it must not import server code.',
      severity: 'error',
      from: { path: '^reviewer-core/src' },
      to: { path: '^server/src|^(drizzle-orm|fastify|octokit|simple-git)($|/)' },
    },
    {
      name: 'no-drizzle-outside-repository',
      comment: 'Rule 2 — Drizzle/db schema may only be imported by repositories.',
      severity: 'error',
      from: {
        path: '^server/src/modules/[^/]+/',
        pathNot: '^server/src/modules/[^/]+/repository',
      },
      to: { path: '^(drizzle-orm)($|/)|^server/src/db/schema' },
    },
    {
      name: 'no-drizzle-in-domain',
      comment: 'Rule 2 — the domain never touches persistence.',
      severity: 'error',
      from: { path: '^reviewer-core/src' },
      to: { path: '^(drizzle-orm)($|/)' },
    },
    {
      name: 'no-sdk-in-application',
      comment: 'Rule 3 — services reach external systems through a container port, not an SDK.',
      severity: 'error',
      from: { path: '^server/src/modules/[^/]+/(service|run-executor|helpers|findings)\\.ts$' },
      to: { path: '^(@anthropic-ai/sdk|openai|octokit|simple-git|@ast-grep/napi)($|/)' },
    },
    {
      name: 'no-adapter-import-from-inner-rings',
      comment: 'Rule 3 — inner rings depend on port interfaces, never on concrete adapters.',
      severity: 'error',
      from: { path: '^server/src/modules/[^/]+/(service|run-executor|repository)|^reviewer-core/src' },
      to: { path: '^server/src/adapters' },
    },
    {
      name: 'no-fastify-in-application-or-data',
      comment: 'Rule 5 — only routes know about HTTP; services and repositories do not.',
      severity: 'error',
      from: { path: '^server/src/modules/[^/]+/(service|run-executor|repository)' },
      to: { path: '^(fastify|fastify-type-provider-zod|@fastify)($|/)' },
    },
    {
      name: 'no-cross-module-internals',
      comment: 'A module reaches another only through @devdigest/shared or a container-hoisted repo.',
      severity: 'error',
      from: { path: '^server/src/modules/([^/]+)/' },
      to: {
        path: '^server/src/modules/([^/]+)/',
        pathNot: [
          '^server/src/modules/$1/',        // same module — allowed
          '^server/src/modules/_shared/',   // shared route helpers — allowed
          '^server/src/modules/[^/]+/index\\.ts$', // public barrels — allowed
        ],
      },
    },
    {
      name: 'no-orphans',
      comment: 'Dead files drift out of the architecture; delete or wire them.',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.(d\\.ts|test\\.ts)$|constants\\.ts$' },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules|server/clones|src/vendor' },
    tsConfig: { fileName: 'server/tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: 'node_modules|server/clones|\\.test\\.ts$|src/vendor' },
  },
};
```

Notes that keep this honest:

- **`src/vendor` and `server/clones` are excluded.** Vendored contracts are the
  shared vocabulary (allowed inward everywhere), and clones are user repos, not
  our code — never lint them (see root `AGENTS.md`).
- **`reviewer-core` uses npm and its own CI.** The `domain-stays-pure` /
  `no-drizzle-in-domain` rules run from the `server/` cruise because it resolves
  `reviewer-core` as source through the path alias. For a standalone gate, add a
  trimmed copy of just those two rules as `reviewer-core/.dependency-cruiser.cjs`
  and a matching `npm run arch:check` there.
- The `$1` back-reference in `no-cross-module-internals` requires
  dependency-cruiser's regex capture support (v13+); we're on v17, so it's fine.

## 2. Wire it into CI

Add the script to `server/package.json`:

```jsonc
"scripts": {
  "arch:check": "depcruise --config .dependency-cruiser.cjs src",
  "arch:graph": "depcruise --config .dependency-cruiser.cjs --output-type dot src | dot -T svg > arch.svg"
}
```

Add a step to `.github/workflows/server-unit.yml` (the hermetic job — no DB
needed for a static import cruise), after install and before/alongside typecheck:

```yaml
      - name: Architecture boundaries (onion)
        working-directory: server
        run: pnpm arch:check
```

Run it locally the same way CI does before pushing. Note: in `server/` a bare
`pnpm arch:check` may trip the supply-chain build gate (`ERR_PNPM_IGNORED_BUILDS`,
per root `AGENTS.md`); if so, call the binary directly:

```bash
cd server && ./node_modules/.bin/depcruise --config .dependency-cruiser.cjs src
```

`arch:graph` renders the actual dependency graph to `arch.svg` (needs graphviz's
`dot`) — useful when a violation isn't obvious from the text output.

## 3. Manual `grep` sweep (fast, no build)

When you want a quick human check without running the full cruise — e.g. mid-edit
or in review — these catch the most common leaks:

```bash
# Rule 2 — Drizzle imported outside a repository/ file
grep -rnE "from '(drizzle-orm|\.\./\.\./db/schema)" server/src/modules \
  | grep -vE "/repository" | grep -v node_modules

# Rule 3 — a service constructing an SDK client directly
grep -rnE "new (Octokit|Anthropic|OpenAI)\b" server/src/modules

# Rule 5 — Fastify types leaking into a service or repository
grep -rnE "fastify" server/src/modules/*/service.ts server/src/modules/*/repository.ts

# Rule 1 — reviewer-core reaching back into the server
grep -rnE "from '.*server/src|@devdigest/api" reviewer-core/src
```

A hit is a lead, not a verdict — confirm it's a real cross-ring import and not,
say, a comment or a type-only re-export from `@devdigest/shared`.

## 4. Recipe — migrate a leaky module (worked on `pulls/`)

`pulls/routes.ts` is the live example: it runs GitHub sync, DB upserts, and
score/cost aggregation inline in the handler. To bring it onto the onion:

1. **Create the data-access ring.** Add `pulls/repository.ts` (+ `repository/`
   if it grows). Move every `container.db.select/insert/update/delete` call into
   named methods: `listByRepo(repoId)`, `upsertFromGitHub(rows)`,
   `latestReviewScores(prIds)`, `latestRunCosts(prIds)`, `replaceFilesAndCommits(...)`.
   These are the only functions that import `drizzle-orm` / `db/schema`.

2. **Create the application ring.** Add `pulls/service.ts` (`new PullsService(container)`).
   Move the orchestration — GitHub sync loop, diff-stat backfill, the
   score/cost aggregation logic — into service methods that call the repository
   and `container.github()`. Keep the *pure* aggregation (row → map reductions) in
   `helpers.ts` so it's unit-testable without a DB or a container.

3. **Thin the route.** `routes.ts` keeps only: Zod schema, `getContext`, call the
   service, shape the `PrMeta[]` / `PrDetail` response, map errors. It should no
   longer import `drizzle-orm` or `db/schema`.

4. **Confirm the boundary closed.** `pnpm arch:check` passes with `pulls/` no
   longer matching `no-drizzle-outside-repository`; the grep sweep is clean.

5. **Record it.** Run `engineering-insights` to note the migration (and remove the
   `pulls/` entry from the deviation list in [`layermap.md`](layermap.md)).

## Handling a *deliberate* new crossing

If a boundary genuinely needs to move (a new port, a new shared repo on the
container), change the ruleset in the **same PR** as the code, with a comment
explaining why — never add a blanket ignore. A temporary, tracked exception uses
`severity: 'warn'` scoped to the exact path (as we would for `pulls/` until its
migration lands), not a deletion of the rule.
