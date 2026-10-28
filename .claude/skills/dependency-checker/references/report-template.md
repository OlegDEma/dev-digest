# Sections 4b and 5 template

Sections 1–3 and 4a come from `scan.mjs`. Append **4b** and **5** below it
(in mode B, write all five sections yourself in the same shape). Keep headings exactly.

````markdown
### 4b. Prioritized findings

#### P0
| Package | Dependency / file | Finding | Evidence | Proposed action | Saves | Effort |
|---|---|---|---|---|--:|:-:|
| `server` | `src/services/review-service.ts` | imports `reviewer-core/src/pipeline.js` by relative path | `rg` hit, line N | route through the `@devdigest/reviewer-core` alias | — | S |

#### P1
| … same columns … |

#### P2
| … |

#### Info
- `<dep>` — <why it is fine / needs human check>.

> Empty tier → write `none`, don't delete the heading.

## 5. Summary

1. **<Highest priority action>** — <package/dep, saving, effort>.
2. …(3–5 total, ordered by priority)

**Reclaimable if all P1–P2 removals land: ~<N> MB (unique, disk — not bundle size).**
All removals above are recommendations awaiting your confirmation.
````

## Rules
- Tables sorted by Saves descending inside a tier. "Saves" = *Unique* bytes, `—` if none.
- Each `Evidence` cell is reproducible in one command or cites a data field.
- Summary: 3–5 items, each naming a package and a dependency or file.
- Effort: `S` ≤30 min · `M` ≤ half a day · `L` more. Add risk only if non-obvious.
