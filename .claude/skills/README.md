# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [pr-self-review](pr-self-review/SKILL.md) `v1.0.0` | Workflow | Local pre-PR merge gate — routes the diff to the other skills, runs `tsc`/tests/tripwires, adversarially verifies each CRITICAL, stamps the verdict; blocks the PR on a confirmed one (ships report-only) |
| [engineering-insights](engineering-insights/SKILL.md) | Workflow | Record & recall durable insights in each module's `INSIGHTS.md` — dated, append-only, Evidence-cited |
| [spec](spec/SKILL.md) | Workflow | Manual entry point for `spec-creator`: relays its blocking questions, runs its research requests as parallel subagents, resumes the same agent, approves only on the owner's word. Never plans or implements |
| [run-plan](run-plan/SKILL.md) | Workflow | `/run-plan plan:<path>` — runs an approved plan: implementer fan-out by the plan DAG → architecture-reviewer ‖ plan-verifier → bounded fix cycle (`max-fix`, re-review of changed files only) → report. Spec and plan are written manually, outside this command |
| [workflow-retro](workflow-retro/SKILL.md) | Workflow | Retro of a multi-agent run: `scripts/collect.py` pulls tokens, agents, launch order, resumes, tool errors and duplicated reads from the session transcripts; then a judged analysis (hard/easy, duplicated, missed) + proposed agent/skill edits → `docs/retros/` |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion/hexagonal ring boundaries for `server/` + `reviewer-core/` — inward-only deps, Drizzle in repos, I/O via ports — reviewer-enforced, no `arch:check` script exists yet |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | React/Next.js code organization — where files/components/hooks/state/logic live, module & Server/Client boundaries |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
