# MCP token audit — trimming vs Tool Search

Date: 2026-10-08, Claude Code 2.1.292, Opus 5.5 (1M window) · Spec: [`specs/11-devdigest-mcp-server.md`](../../specs/11-devdigest-mcp-server.md) (diagram 6, D24, D26, D30, D31)

Purpose: measure what MCP tool definitions cost in Claude Code's context, and compare two
ways of reducing it: trimming a server's tools, and Tool Search (deferred definitions).
Every number below is read from `/context`; none is estimated.

## Prerequisites

- API up: `./scripts/dev.sh`.
- `cd mcp && npm ci` (npm only).
- Run every command from the **repo root** (the devdigest entry uses relative paths).
- For steps 2-4 the owner exports `GITHUB_PERSONAL_ACCESS_TOKEN` in their own shell. It is
  never written to a file, never pasted into a chat (T8).
- At the start of every step run `/mcp` and confirm exactly the expected servers.

## Steps

Each step is a fresh `claude` session. `--strict-mcp-config` ignores every other MCP source.
Read `/mcp` (servers, tool count) and `/context` (MCP tool tokens, total) and record them.

### Step 1 - baseline: devdigest only, no Tool Search

```sh
ENABLE_TOOL_SEARCH=false claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":true,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}}}}'
```

### Step 2 - plus the official GitHub MCP, all toolsets, no Tool Search

```sh
ENABLE_TOOL_SEARCH=false claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":true,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}},"github":{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"}}}}'
```

### Step 3 - GitHub trimmed to pull_requests,repos, read-only, no Tool Search

Two trimming routes. Route (a) was measured on 2026-10-08 (95 → 16 tools); route (b) is *unverified* (no binary installed).

(a) Remote server, headers `X-MCP-Toolsets` and `X-MCP-Readonly` (verified):

```sh
ENABLE_TOOL_SEARCH=false claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":true,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}},"github":{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}","X-MCP-Toolsets":"pull_requests,repos","X-MCP-Readonly":"true"}}}}'
```

(b) Local `github-mcp-server stdio` with env `GITHUB_TOOLSETS` and `GITHUB_READ_ONLY` (*unverified*):

```sh
ENABLE_TOOL_SEARCH=false claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":true,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}},"github":{"type":"stdio","command":"github-mcp-server","args":["stdio"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_PERSONAL_ACCESS_TOKEN}","GITHUB_TOOLSETS":"pull_requests,repos","GITHUB_READ_ONLY":"1"}}}}'
```

### Step 4 - Tool Search (auto), devdigest always loaded, GitHub all toolsets

```sh
ENABLE_TOOL_SEARCH=auto claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":true,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}},"github":{"type":"http","url":"https://api.githubcopilot.com/mcp/","headers":{"Authorization":"Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"}}}}'
```

### Step 5 - Tool Search on our own server (devdigest only, alwaysLoad false)

```sh
ENABLE_TOOL_SEARCH=true claude --strict-mcp-config --mcp-config '{"mcpServers":{"devdigest":{"type":"stdio","command":"mcp/node_modules/.bin/tsx","args":["mcp/src/index.ts"],"alwaysLoad":false,"env":{"DEVDIGEST_API_URL":"http://localhost:3001","DEVDIGEST_MCP_RUN_WAIT_SEC":"120"}}}}'
```

Measured non-interactively with `claude -p "/context" --mcp-config <file> --strict-mcp-config`.

Then send the prompt `list the devdigest reviewer agents` and note the `ToolSearch` call that precedes the first devdigest use.

## Results

| Step | `ENABLE_TOOL_SEARCH` | Servers | Tools listed in `/mcp` | MCP tool tokens in `/context` | Total context tokens | Δ vs step 1 | Notes |
|------|----------------------|---------|------------------------|-------------------------------|----------------------|-------------|-------|
| 1 | `false` | devdigest | 5 | 956 | 53.1k | — | baseline; with Tool Search off the built-in system tools also load in full (33.5k) |
| 2 | `false` | devdigest + github (remote default toolsets) | 5 + 46 | 20.3k | 73.8k | +20.7k | no `X-MCP-Toolsets` header = the remote server's default toolsets, not all |
| 2-all | `false` | devdigest + github (`X-MCP-Toolsets: all`) | 5 + 95 | 42.4k | 96.0k | +42.9k | schema bloat: ~41k tokens of GitHub definitions before the first word |
| 3 | `false` | devdigest + github trimmed (`X-MCP-Toolsets: pull_requests,repos`, `X-MCP-Readonly: true`) | 5 + 16 | 8.2k | 61.7k | +8.6k | route (a) works: 95 → 16 tools, −34.3k vs 2-all |
| 4 | `auto` | devdigest (alwaysLoad) + github (all) | 5 + 95 | 42.4k (**nothing deferred**) | 96.5k | +43.4k | on a 1M-token window 42k is ~4 %, below the `auto` threshold, so `auto` does not kick in |
| 4-on | `true` (same with `auto:3`) | devdigest (alwaysLoad) + github (all) | 5 + 95 | 1k loaded + 41.3k deferred | 31.0k | −22.1k | Tool Search: only devdigest stays loaded; built-in tools 33.5k → 10.7k + 20.1k deferred |
| 5 | `true` | devdigest (alwaysLoad false) | 5 | 957 (**deferred**) | 29.3k | −23.8k | our own server deferred too; it is only ~1k, so the gain is from built-in tools |
| V18 | `true` | devdigest (alwaysLoad true) | 5 | 957 (**loaded**) | 30.3k | −22.8k | `alwaysLoad` beats forced Tool Search |

## Trimming vs Tool Search

- **Trimming** removes tools at the server. The model has fewer capabilities, but there is no
  search step, it works on every model and proxy, and there is nothing to miss.
- **Tool Search** keeps every tool but defers definitions: only names are in context until a
  search. It costs one extra step and tokens per search, is not available on Haiku, Vertex or
  proxies that drop `tool_reference` blocks, can produce false misses, and ranking depends on
  description keywords (D26).
- **Neither** shrinks tool responses. devdigest caps them at 20,000 chars (D11).
- A frequently used server gets `alwaysLoad: true` (D24).

## Inspector check (D30)

- Date: 2026-10-08, Inspector v2.10.1 (CLI and UI)
- Tools listed (expect 5): 5, in D13 order, rev 7 descriptions, all four annotations
- Agent count from `tools/call list_agents`: 6 (5 enabled + disabled `TestAgent`); `get_blast_radius` → `{"status":"not_implemented",…}`, not an error

## Live scenario (D31)

Prompt, verbatim: `review PR #3 in the demo repo with security-reviewer, are there critical findings`

Expected call chain: `list_agents` -> `run_agent_on_pr` -> (`get_findings` if the answer is `running`).

Run on 2026-10-08 against `OlegDEma/dev-digest` #3 in a fresh `claude -p` session with only devdigest tools.

- Tools actually called: `run_agent_on_pr(agent:"security-reviewer")` → error "not found. Call list_agents…"
  → `list_agents` → `run_agent_on_pr(agent:<Security Reviewer id>)` → `{"status":"running",…}` after
  120 s → `get_findings` (polled). The error text led the model to the right next call (P4).
- The run itself took 574 s (deepseek-v4-flash, 12.6k output tokens), far past the 120 s wait, so
  the first session gave up while still `running`; a second fresh session called
  `get_findings(run_id)` once and quoted the result.
- Verdict: `approve`, score 100, 0 findings.
- Quoted findings: none. The model's summary says no code diff reached it, although the stored
  prompt trace contains `diff --git` hunks — a reviewer-side issue outside the MCP server.

## Gotchas

- **`auto` did nothing on a 1M-token window** (step 4): 42k of MCP definitions is ~4 %, below the
  default threshold. Use `true` or a lower `auto:N` (e.g. `auto:3`) to defer them. The slide's
  "auto is enough" holds on smaller windows.
- The remote GitHub server without `X-MCP-Toolsets` exposes its default toolsets (46 tools), not
  everything; `all` gives 95 here (the slide's ~160 counts a different server build).
- `${GITHUB_PERSONAL_ACCESS_TOKEN}` **is** expanded inside `--mcp-config`, but only if the
  variable is in the launching shell. A session started before the token was exported does not
  see it (the header then fails as "badly formatted"); launch through `zsh -ic` or a new terminal.
- `auto:N` takes N = 0–100 % of the context window (per the `claude` 2.1.292 binary); a small
  server alone stays loaded under `auto`, which is why step 5 uses `true`.
