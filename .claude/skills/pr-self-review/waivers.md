# Waivers

A gate with no escape hatch gets disabled the first time it is wrong at an
inconvenient hour. A waiver is that hatch — narrow, recorded, and self-limiting,
so it relieves pressure without quietly becoming the way every finding is dodged.

## What a waiver is

A decision that a specific confirmed finding does **not** block *this* change, with
a reason a reviewer can read later and agree or disagree. It is scoped to a
**finding signature**, not "this rule" broadly:

```
signature = <skill>/<rule> @ <path> :: <sha256(offending line, trimmed)[:12]>
```

Tying it to the line's content means the waiver evaporates the moment the code
changes — you cannot waive a problem once and inherit the pass forever.

## How to waive

During stage 4 (verify), when a CONFIRMED critical is a deliberate, understood
trade-off:

1. Append a row to the ledger below (newest at the bottom, append-only).
2. Pass its signature to the stamp: `pr-gate-check.mjs --write <verdict> --waivers <sig>[,<sig>]`.
   A waived critical is subtracted from the block decision but still printed in the
   report under **Waived**, so it stays visible.

Never waive a Tier-1 deterministic failure (a red `tsc`/test is not a judgment
call) or a committed secret (T8) — fix those.

## The three-strike rule

A signature may be waived on **two** changes. The **third** time the same
signature comes up, the waiver is refused: three appearances is a pattern, not an
exception, and the debt gets paid instead of rolled. The reviewer counts prior
rows with the same `<skill>/<rule> @ <path>` (ignoring the line hash, since a
recurring problem drifts lines) — at two prior strikes, the finding blocks and
must be fixed or the rule changed.

## Ledger

Append-only. One row per waiver. `strikes` is this signature's count including
this row.

| date | signature | strikes | reason | by |
| --- | --- | --- | --- | --- |
| _(none yet)_ | | | | |

<!-- Example row shape (do not count as a real waiver):
| 2026-09-21 | onion-architecture/R2 @ server/src/modules/pulls/routes.ts :: a1b2c3d4e5f6 | 1 | pulls/ Drizzle-in-route is a known, tracked deviation being paid down; scoped to warn in the arch ruleset. | oleh |
-->
