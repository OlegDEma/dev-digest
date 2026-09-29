---
name: engineering-insights
description: "Record and recall durable engineering insights — things that are true about this codebase but not visible in it — in the right module's INSIGHTS.md. Use at the END of any non-trivial task to capture what was learned; the moment something non-obvious surfaces mid-task (a gotcha, a dead end, a hidden convention, a recurring error and its fix, a deliberate decision); and before starting work in a module, to recall what is already known. Routes the touched path to the correct file (root INSIGHTS.md for cross-package findings, else server/client/reviewer-core/e2e), dedups against existing entries, and enforces the fixed sections, dated append-only format, and Evidence citations. Trigger terms: wrap-up, insight, learning, lesson learned, gotcha, what do we know about, /engineering-insights."
metadata:
  tags: insights, learnings, memory, wrap-up, knowledge, workflow
---

# Engineering Insights

The project's compounding memory. `INSIGHTS.md` files capture findings that are
**true about this code but not visible in it** — so the next session starts
knowing what this one learned instead of re-deriving it.

The loop is already wired in the root `AGENTS.md`: agents *read* the relevant
`INSIGHTS.md` before work and *run this skill* after. This skill is the "record"
and "recall" engine — it routes to the right file, holds the format, and enforces
the quality bar.

## When to use

**Recall (read) — before you start.** Beginning work in a module, or asked "what
do we know about X" → read that module's `INSIGHTS.md` **and** the root one
first. Treat entries as high-confidence guidance unless told otherwise. An entry
names a date: verify a file/flag/limit it cites still exists before acting on it.

**Record — two triggers (capture beats recall; a lost lesson is gone):**

1. **Wrap-up (end of task).** After any non-trivial task — roughly a session
   >30 min, or any length where a problem was hit, a decision made, or something
   discovered. **Skip** trivial sessions (a config tweak, a rename, a routine fix
   where nothing surprised you). Signal over volume — noise costs more than
   silence.
2. **Capture-as-you-go (mid-task).** The instant something non-obvious surfaces —
   a gotcha, a failed approach, a hidden convention, a recurring error + its fix,
   a deliberate trade-off — record it *then*, before it is buried by the next
   step.

If nothing cleared the quality bar below, record nothing and say so. That is a
valid outcome.

## Record — the workflow

1. **Gate.** Does the finding pass both gates below — worth 5+ minutes to the next
   agent **and** specific enough to act on cold? If not, stop — or park a genuinely
   open thread under **Open Questions**.
2. **Route** the touched path to one target file:
   | Touched | Target |
   |---|---|
   | `server/**` | [`server/INSIGHTS.md`](../../../server/INSIGHTS.md) |
   | `client/**` | [`client/INSIGHTS.md`](../../../client/INSIGHTS.md) |
   | `reviewer-core/**` | [`reviewer-core/INSIGHTS.md`](../../../reviewer-core/INSIGHTS.md) |
   | `e2e/**` | [`e2e/INSIGHTS.md`](../../../e2e/INSIGHTS.md) |
   | ≥2 packages, `**/vendor/shared/**`, `scripts/**`, or root config | [`INSIGHTS.md`](../../../INSIGHTS.md) (root) |

   Rule of thumb: a finding about **one package's internals** goes in that
   package; a finding about **how packages interact** (or a contract they share)
   goes in root. One insight → one file; don't cross-post.
3. **Read the target file and dedup.** Search it for the same subject. If an
   entry already covers it: **do not duplicate.** Either skip, or — if reality
   changed — nest a dated correction under the existing entry (see Format).
4. **Pick a section that already exists in that file.** Never invent a heading
   ("Add to the one that fits; never invent a new heading" — the file header says
   so). The sets differ: modules carry **Decisions**; root carries **Session
   Notes**. Both share **What Works · What Doesn't Work · Codebase Patterns · Tool
   & Library Notes · Recurring Errors & Fixes · Open Questions**. See
   `references.md` for what belongs in each.
5. **Write the entry** in the exact format below, specific enough to act on cold.
6. **Append** it at the end of that section (append-only — never reorder or
   rewrite existing entries).
7. **Report** which file/section you wrote to, in one line. The entry ships with
   the change it documents (same commit/PR); it is versioned in git on purpose.

## Format (match the existing files exactly)

One dated bullet, appended to the chosen section:

```
- **YYYY-MM-DD** — <finding: specific, actionable, scoped to this repo, with
  inline `code` and `path/to/file.ts:line`>. Evidence: `path:line`[, `cmd`].
```

- Date = today, from the environment. Newest entries sit at the bottom of a
  section.
- **Evidence is mandatory** — the `file:line`, `diff`, or command that proves it.
  An unverifiable claim is not an insight.
- **Correcting a stale entry: never edit or delete it.** Nest a new dated bullet
  *beneath* it, indented, saying what changed. This preserves the history and
  avoids merge conflicts and silently-overwritten lessons. The ESLint thread in
  the root file's **What Doesn't Work** is the worked example — a claim, then two
  indented dated corrections as reality moved.

## The quality bar — two gates

An entry must pass **both**:

**1. The 5-minute test — is it worth recording?** Would this save the next agent
5+ minutes the next time it hits this situation? Generic programming knowledge, a
one-off that won't recur, or anything already in the docs/README fails — don't
write it.

**2. The cold-read test — is it specific enough to act on?** An agent with zero
memory of this session reads the entry and knows exactly what to do. *If it would
be obvious to anyone reading the code, don't write it.*

- ❌ "Promises can be tricky." / "Be careful with async." — noise, not a lesson.
- ✅ "`Promise.all()` on the ingest pipeline times out past ~30 items — use
  `Promise.allSettled()` in batches of 10 for this module."
- ✅ "Checkout state is shared across 3 components — always go through the Zustand
  store (`cartStore.ts`); local component state silently desyncs here."

Every good entry carries the **exact** symbol/file/limit/number **and** the exact
remedy. If you can't be that specific yet, don't write it. See `examples.md` for
a good/bad pair per section, in this repo's own terms.

## Guardrails

- **Append-only.** Add entries; never rewrite or delete existing ones. Corrections
  nest as dated sub-bullets (above).
- **Resolve contradictions explicitly.** Two entries that disagree make the agent
  guess. When you supersede one, nest the correction so the conflict is visible
  and dated.
- **One subject, one entry.** Dedup before writing (step 3).
- **Don't let a file bloat.** Past ~200 entries the signal-to-noise ratio drops.
  Then split by domain (`INSIGHTS-<domain>.md`, referenced from `AGENTS.md`) or
  prune entries whose code was deleted/refactored. A periodic (≈quarterly) human
  review keeps it a curated draft, not an append-only landfill — the wrap-up does
  ~90%, a human spot-checks the rest.
- **Never invent a heading**; reuse the target file's existing sections.

## Recall — reading insights

Asked to read/recall, or starting in a module: open that module's `INSIGHTS.md`
and the root `INSIGHTS.md`, and cite the specific dated entry you're relying on
(e.g. "per `server/INSIGHTS.md` → Tool & Library Notes, 2026-08-05"). Entries are
timestamped snapshots — re-verify anything load-bearing before you build on it.

## Automation (optional, not installed)

Triggering here is by this skill's description, the `AGENTS.md` "After finishing"
reminder, and manual `/engineering-insights`. That's deliberate: auto-firing at
session end is unreliable on its own. The reliable-but-heavier upgrade is a `Stop`
hook that runs a capture script on session end — see `references.md` for the
ready-to-paste config. Adding a hook is standing configuration; only do it when
the user asks.
