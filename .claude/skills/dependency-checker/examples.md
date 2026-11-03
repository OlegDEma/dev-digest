# Example — sections 4b and 5 (illustrative numbers)

### 4b. Prioritized findings

#### P0
| Package | Dependency / file | Finding | Evidence | Proposed action | Saves | Effort |
|---|---|---|---|---|--:|:-:|
| `server` | `src/services/review-service.ts` | imports `reviewer-core/src/pipeline.js` by relative path, bypassing the public entry | grep import list | import via the `@devdigest/reviewer-core` alias | — | S |

#### P1
| Package | Dependency / file | Finding | Evidence | Proposed action | Saves | Effort |
|---|---|---|---|---|--:|:-:|
| `server` | `package.json` → `moment` | declared, never imported | `rg moment server/src` → 0 hits | remove `moment` | ~4.2 MB | S |
| `client`, `server`, `reviewer-core` | `zod` | three declared ranges (3.22.4 / 3.23.8) — drift, 3 copies installed | section 3b | pin one range in all three manifests | — | S |

#### P2
| Package | Dependency / file | Finding | Evidence | Proposed action | Saves | Effort |
|---|---|---|---|---|--:|:-:|
| `client` | `date-fns` | 22 MB, one import | `rg date-fns client/src` → 1 | import the single function or use `Intl` | ~20 MB | M |

#### Info
- `client` → `next` (132 MB) — framework, no alternative.
- `reviewer-core ↔ server` cycle — via vendored `shared`; known, see root `INSIGHTS.md`.
- `react-dom` flagged unused — peer of `next`, verified not removable.

## 5. Summary

1. **Fix the boundary leak** in `server/src/services/review-service.ts` (P0, S).
2. **Remove `moment`** from `server/package.json` (~4.2 MB, S) after you confirm.
3. **Align `zod`** to one range across `client`, `server`, `reviewer-core` (P1, S).
4. **Trim `date-fns`** in `client` (~20 MB, M).

**Reclaimable if all P1–P2 removals land: ~24 MB (unique, disk — not bundle size).**
All removals above are recommendations awaiting your confirmation.
