# mcp (`@devdigest/mcp`) — agent map

The `devdigest` MCP server: five tools over the **running** DevDigest API, stdio
only. Spec: [`../specs/11-devdigest-mcp-server.md`](../specs/11-devdigest-mcp-server.md)
(§7b holds every model-visible text, §7c the ring map). Overview + tool table:
[`README.md`](README.md).

## Commands (⚠️ npm, not pnpm)

```sh
npm test          # vitest — hermetic: FakeApi + in-memory MCP client, no network, no LLM
npm run typecheck # tsc --noEmit (runs from source via tsx; there is no build)
npm start         # tsx src/index.ts — needs the API up (./scripts/dev.sh); speaks MCP on stdio
```

`DEVDIGEST_API_URL` (default `http://localhost:3001`) · `DEVDIGEST_MCP_RUN_WAIT_SEC`
(default 120, clamped 0–900; how long `run_agent_on_pr` blocks).

## Conventions (module-local, non-default)

- **stdout carries MCP frames only.** Logs go to stderr (`src/log.ts`). No
  `console.log` / `process.stdout` in `src/`. Register with `tsx` directly (as
  `.mcp.json` does), not `npm start`, which prints a banner to stdout.
- **Rings** (spec §7c). Rim: `index.ts`, `config.ts`, `api/http.ts`, `tools/*.ts`
  (thin: resolve → call → format → `toToolError`). Application: `run-review.ts`,
  `resolve.ts`, `wait.ts`. Pure: `format.ts`, `texts.ts`, `errors.ts`, `api/port.ts`.
  Pure modules import only each other, or `import type` from the port and shared.
  `fetch` lives only in `http.ts`; handlers never call `getRun`/`activeRuns`/`startReview`.
- **`@devdigest/shared` is imported with `import type` only** (tsconfig path alias
  to `../server/src/vendor/shared`); no runtime load, so no second zod. Hand-written
  literal lists that mirror a shared enum are tied to it by a compile-time assertion
  (`STATUS_FILTER` in `tools/get-conventions.ts`).
- **Texts only from spec §7b / `src/texts.ts`.** No other file holds model-visible
  prose. A wording change = spec first, then `texts.ts`, then `test/verbatim.test.ts`.
- **New tools follow P1–P4:** a result not an operation; flat scalar args; a concise
  JSON answer (no `outputSchema`); every error names the next call. Keep `tools/list`
  under the 4,000-char budget (`test/budget.test.ts`) and set all four annotations.
- **zod types:** the tsconfig must NOT alias `zod` to `./node_modules/zod` here —
  it makes the SDK's `registerTool` types fail (see the root `INSIGHTS.md`, Tool & Library Notes, 2026-10-06).
- `.mcp.json` sets `alwaysLoad: true` for devdigest; descriptions double as Tool Search
  keywords — keep them keyword-rich and within the `tools/list` budget (spec 11 D24, D26).
- `get_blast_radius` calls `GET /pulls/:id/blast`; texts live in spec 12 §7.3 (supersedes spec 11 D27).
- npm only: `package-lock.json` is the only lockfile (D32).
- Aborting a waiting `run_agent_on_pr` stops polling but never cancels the server
  run; a retry re-attaches to it (agent-only match).
