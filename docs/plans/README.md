# docs/plans/ — implementation plans

One file per spec: `YYYY-MM-DD-slug.md`, exactly the file name of the spec it
implements — `docs/specs/YYYY-MM-DD-slug.md` or `<pkg>/specs/YYYY-MM-DD-slug.md`,
written by [`spec-creator`](../../.claude/agents/spec-creator.md). The date is the
spec's, not the plan's, so the pair always shares one name. Written only by the
[`implementation-planner`](../../.claude/agents/implementation-planner.md) agent,
from a spec with `Status: approved`, after the owner has answered its requirements review and chosen single- or
multi-agent execution.

- **The spec owns *what*** — scope, product decisions, EARS acceptance criteria,
  workflow and service-communication diagrams, boundary contracts.
- **The plan owns *how*** — code map, phased file-by-file steps (each mapped to a
  spec AC and a project skill), agent lanes, risks, verification commands.

A plan never adds or rewords an AC. If the spec has to change, `spec-creator` revises
it and the owner re-approves it first and the plan is revised against it.

Legacy root `specs/01`–`12` predate this split and carry their plan inside the
spec file.
