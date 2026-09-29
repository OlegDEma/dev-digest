# pr-self-review — self-eval harness

Measures the two things that make this gate good, instead of guessing:

- **Trigger reliability** — does it fire on a PR intent (id 1) and stay quiet on a
  docs-only push (id 2)?
- **Review quality** — recall on a planted CRITICAL (id 3), precision against
  false-positive bait (id 4), and no invented findings on clean code (id 5).

`evals.json` holds the prompts + assertions. `fixtures/` holds self-contained
sample "changed files" (outside every package's `tsconfig`, so they never touch
the real build):

| Fixture | Must produce |
| --- | --- |
| `planted-critical/pulls.routes.ts` | 🔴 BLOCKED — Drizzle-in-route (onion), unvalidated input, snake/camel mismatch |
| `false-positive-bait/CopyButton.tsx` | 🟢 PASS — aria-label IS present (next line); fetch URL is config, not user input |
| `known-good/formatCost.ts` | 🟢 PASS — nothing to flag |

## Running

Use the `skill-creator` loop (with-skill vs a baseline with no skill), which
spawns the runs, grades the assertions, and opens the benchmark viewer. In short:

1. For each eval, run the prompt **with** `pr-self-review` and **without** it.
2. Grade against the assertions in `evals.json`.
3. Compare — the with-skill runs should BLOCK id 3, PASS ids 4–5, trigger on id 1,
   stay quiet on id 2; the baseline typically misses the trigger and the tripwire.

The signal to watch: **precision** (ids 4–5 must not regress to false blocks) is
as important as **recall** (id 3). A gate that over-blocks gets disabled. Add a
new fixture whenever a real review misfires — that is how the skill improves.
