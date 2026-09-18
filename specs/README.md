# specs/ — cross-module feature specifications

One file per feature that touches **two or more** packages (server / client /
reviewer-core / e2e): `NN-slug.md`, written before the code, with EARS acceptance
criteria (`AC-1`, `AC-2`…). A feature scoped to a single package gets its spec in
that package's own `specs/` (e.g. [`../server/specs/`](../server/specs/)) instead.

Not to be confused with [`../e2e/specs/`](../e2e/specs/), which holds
`*.flow.json` browser-flow definitions — a different thing entirely.

> Stub — no specs yet.
