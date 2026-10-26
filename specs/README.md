# specs/ — cross-module feature specifications

One file per feature that touches **two or more** packages (server / client /
reviewer-core / e2e): `NN-slug.md`, written before the code, with EARS acceptance
criteria (`AC-1`, `AC-2`…). A feature scoped to a single package gets its spec in
that package's own `specs/` (e.g. [`../server/specs/`](../server/specs/)) instead.

**Legacy folder.** New specs are written by the `spec-creator` agent into
`docs/specs/YYYY-MM-DD-slug.md` (≥2 modules) or `<pkg>/specs/YYYY-MM-DD-slug.md`, in English; this folder
keeps `01`–`12`, which mix spec and plan in one file. A new spec's
implementation plan (the *how*) lives in
[`../docs/plans/YYYY-MM-DD-slug.md`](../docs/plans/README.md), written by the
`implementation-planner` agent, which never writes or edits a spec.

Not to be confused with [`../e2e/specs/`](../e2e/specs/), which holds
`*.flow.json` browser-flow definitions — a different thing entirely.

Current specs: [`01-run-cost-badge.md`](01-run-cost-badge.md) · [`02-findings-on-timeline.md`](02-findings-on-timeline.md) · [`03-skills.md`](03-skills.md) · [`04-conventions.md`](04-conventions.md) · [`05-claude-code-subagents.md`](05-claude-code-subagents.md) · [`06-helper-subagents.md`](06-helper-subagents.md) · [`07-doc-writer-skill-routing.md`](07-doc-writer-skill-routing.md) · [`08-intent-layer.md`](08-intent-layer.md) · [`09-cheaper-agent-pipeline.md`](09-cheaper-agent-pipeline.md) · [`10-prompt-assembly-logging.md`](10-prompt-assembly-logging.md) · [`11-devdigest-mcp-server.md`](11-devdigest-mcp-server.md) · [`12-blast-radius.md`](12-blast-radius.md).
