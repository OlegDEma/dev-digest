# Changelog — pr-self-review

Semver per `README.md` → *Changing the skill*. Newest on top.

## 1.0.0 — 2026-09-21

Initial release. Ships in **`report-only`** (nothing blocks).

- Six-stage workflow (collect → deterministic gate → route & review → verify &
  waive → decide & stamp → report & act).
- **Slices + routing** (`routing.md`): client vs server/reviewer-core, each routed
  to the existing project skills. The `security` skill is deliberately not routed
  (Express/Mongo mismatch); its applicable surface is covered by tripwires T5/T8.
- **One severity scale** owned by the gate, with the rule that a CRITICAL must
  state a production consequence.
- **Adversarial verification** of every candidate CRITICAL before it can block.
- **DevDigest tripwires** (`references/repo-tripwires.md`, T1–T9) for the
  cross-file bugs no single skill catches.
- **Stamp system** (`scripts/gate-lib.mjs`, `pr-gate-check.mjs`): a tree-keyed
  verdict so a re-run, the hook, and CI never re-review a tree already judged.
- **CI half** (`scripts/pr-gate-ci.mjs`, `.github/workflows/pr-gate.yml`, job
  `conventions`): validates a committed stamp, no LLM, `contents: read`. Inert
  until made a required check.
- **Waivers** (`waivers.md`): signature-scoped, ledgered, three-strike rule.
- **Manual invocation.** `.claude/settings.json` ships with no hooks; the armed
  PreToolUse config lives unplugged in `.claude/settings.json.hook-example` with
  its body `scripts/pr-gate-guard.sh`.
- **Self-eval harness** (`evals/`): trigger, precision, and recall fixtures.

Deliberate omissions (see README): no LLM in CI, no PR comments, no auto-fix.
