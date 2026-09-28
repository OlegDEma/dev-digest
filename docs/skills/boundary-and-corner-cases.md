---
name: boundary-and-corner-cases
description: When a diff changes logic over collections, numbers, strings, dates or optional values, check the tests for the boundary inputs listed here and report each missing corner case as a WARNING naming the exact input.
type: rubric
---
# Boundary and corner cases

The bugs live at the edges. For each unit of logic the diff changes, check
whether the tests drive the edge inputs that apply — and name the specific
missing input, not "add more tests".

## Checklist (apply what fits the type of the input)
- **Collections:** empty; exactly one; the maximum / page-size boundary;
  duplicates; already-sorted vs reversed when order matters.
- **Numbers:** 0; negative; the off-by-one at each inclusive/exclusive bound;
  `NaN` / `Infinity` when parsing; integer overflow for ids and counts.
- **Strings:** empty; whitespace-only; unicode / emoji length; leading or
  trailing separators; a value that equals the delimiter.
- **Optionals:** `null` vs `undefined` vs missing key; an explicit empty
  object; a default that is falsy (`0`, `""`, `false`) and must NOT be
  replaced by `??` / `||`.
- **Time:** midnight and month/year rollover; DST; a timestamp exactly at the
  cutoff; clock skew between "now" captured twice.
- **Concurrency / retries:** the same operation applied twice (idempotency);
  the second call arriving before the first completes.

## Report
- One WARNING per missing corner case that the diff's logic actually branches
  on; cite the production line whose behaviour at that input is unproven and
  state the input verbatim (e.g. `items = []`, `limit = 0`).
- SUGGESTION when the edge is plausible but the code path clearly handles it by
  construction.

## Do not
- Do not list every bullet above; only the ones the changed code can reach.
