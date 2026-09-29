---
name: route-versioning
description: When a diff changes an existing public route's path, method, params or response, require the old signature to stay served (alias or versioned path) with a stated deprecation window; report an unversioned change as CRITICAL.
type: rubric
---
# Route versioning

Public routes are contracts with callers you cannot see. Change them by
ADDITION, never by mutation.

## Rules
1. A changed path or method keeps the old route as an alias that serves the
   same response, or the new route is mounted under a new version prefix
   (`/v2/...`) beside the old one.
2. A changed request shape accepts the old shape for the deprecation window
   and maps it to the new one at the edge.
3. A changed response shape ships under the new version only; the old version
   keeps its shape byte-for-byte.
4. Every deprecation names a sunset (a date or a release) in the route's
   comment and in the changelog.

## Report
- CRITICAL: the old signature is gone in this diff and nothing serves it.
- WARNING: the old signature is kept but no sunset is stated.
- Cite the route line and say which rule above it violates.

See `references/notes.md` for the rationale; `scripts/check.sh` is the CI
helper the original team used — DevDigest lists it and does NOT run it.
