# `@devdigest/mcp` — DevDigest over MCP

A local **stdio** MCP server that exposes the running DevDigest API (`:3001`) as five
tools. It is a thin HTTP wrapper; it never embeds the Fastify app. Spec:
[`../specs/11-devdigest-mcp-server.md`](../specs/11-devdigest-mcp-server.md).

| Tool | Does | Writes? |
|------|------|---------|
| `list_agents` | The configured reviewer agents | no |
| `run_agent_on_pr` | Runs one agent on a PR, waits up to `DEVDIGEST_MCP_RUN_WAIT_SEC` (120 s) and returns verdict + findings | **yes** |
| `get_findings` | Verdict + paged findings of a finished run (fallback when the wait cap hit) | no |
| `get_conventions` | The repo's extracted conventions (accepted by default) | no |
| `get_blast_radius` | Symbols in a PR's changed files, their callers (`file:line`) and the endpoints/crons behind them; calls `GET /pulls/:id/blast` | no |

Addressing is flat: `repo: "owner/name"`, `pr: <number>`, `agent: <name or id>`.

## Setup

```sh
cd mcp && npm ci
./scripts/dev.sh            # from the repo root: the API must be up
```

The root `.mcp.json` registers the server as `devdigest` for Claude Code
(launched from the repo root; no secrets in it). It sets `alwaysLoad: true`, so Claude Code
loads the five tool definitions up front instead of deferring them behind Tool Search
(spec 11 D24).

## Try it

Run from the repo root with the API up (`./scripts/dev.sh`). Checked on 2026-10-08 with
Inspector v2.10.1.

```sh
# 1. Inspector UI: open the printed URL, toggle the server on (Servers), open Tools,
#    pick list_agents, Execute Tool
npx @modelcontextprotocol/inspector mcp/node_modules/.bin/tsx mcp/src/index.ts

# 2. Inspector CLI: list the tools
npx @modelcontextprotocol/inspector --cli mcp/node_modules/.bin/tsx mcp/src/index.ts --method tools/list

# 3. Inspector CLI: call list_agents against the live API
npx @modelcontextprotocol/inspector --cli mcp/node_modules/.bin/tsx mcp/src/index.ts --method tools/call --tool-name list_agents

# 4. Hermetic tests
cd mcp && npm test
```

Token audit (trimming vs Tool Search): [`../docs/experiments/mcp-token-audit.md`](../docs/experiments/mcp-token-audit.md).
