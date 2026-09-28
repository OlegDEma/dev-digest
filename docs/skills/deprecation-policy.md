---
name: deprecation-policy
description: Require every removal to be preceded by a deprecation that callers can act on; report anything deleted without a prior deprecated period, and any deprecation with no replacement, no sunset date or no runtime signal, as WARNING — or CRITICAL when the surface is public.
type: convention
---
# Deprecation policy

Removing something is the last step, never the first. A caller you cannot see
needs a window in which the old path still works AND they can find out it is
going away.

## A deprecation is complete only with all four
1. **The old path still works**, unchanged, for the whole window.
2. **A named replacement** — "use `title`", "use `POST /v2/reviews`". "Removed" is
   not a migration path.
3. **A sunset date or release**, not "soon".
4. **A signal at runtime or build time** — a `@deprecated` JSDoc tag (the editor
   shows it), a `Deprecation` response header, or a one-line server log. A note
   in a changelog nobody reads is not a signal.

## What to report
- A route, export, field or enum value **deleted with no prior deprecation** →
  WARNING; CRITICAL if it is on the public API surface.
- A `@deprecated` tag with no replacement or no date → WARNING.
- A sunset date already in the past with the code still present → WARNING, the
  window has lost its meaning.
- A deprecation added **and** the thing removed in the same PR → WARNING: the
  window is zero.

## Good / bad

```ts
// BAD — the route simply disappears; every existing caller 404s on deploy.
- app.get('/skills/:id/stats', handler);
```

```ts
// GOOD — keep serving it, point at the replacement, sunset it on a date.
/** @deprecated use `GET /skills/:id/metrics`; removed after 2026-12-01. */
app.get('/skills/:id/stats', async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
  return handler(req, reply);
});
```

## Report
- Cite the removed or deprecated line, name the replacement, and give the window.
- One finding per removed surface.
