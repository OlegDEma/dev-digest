---
name: breaking-change-detector
description: Treat every existing route and shared contract as having callers you cannot see; when the diff changes a route path, HTTP method, required input, status code or response shape, report it as CRITICAL unless the old signature is kept, versioned or explicitly deprecated.
type: rubric
---
# Breaking-change detector

The API surface is public. An existing caller — a client bundle, a CI runner,
another service, a saved fixture — is written against the previous signature
and will not be updated by this PR. The diff cannot see those callers, so the
policy is: assume they exist.

## What counts as breaking (report as CRITICAL)
- Changing a route **path** or **method**, or renaming / re-ordering a path
  parameter (`/skills/:id` → `/skill/:id`, `GET` → `POST`).
- Making an optional input **required**, removing an accepted input, or
  narrowing a type / enum / validation rule so a previously valid request now
  fails.
- **Removing or renaming** a field in a response, making a non-null field
  nullable, or changing a field's type.
- Changing a **status code** or the error envelope a caller branches on.
- Changing a shared Zod contract in a way that fails `parse()` on data the
  previous version produced (including rows already persisted).

## What is compatible (do not report as breaking)
- Adding an **optional** input with a default.
- Adding a response field. (Say so explicitly when the consumer is known to
  validate strictly and reject unknown keys.)
- Loosening validation; adding a new route beside the old one.
- A change shipped **with** the old signature still served (a versioned path,
  a deprecation window, an alias) — mention the sunset plan if there is none.

## Good / bad

```ts
// BAD — every existing caller sending { name } now gets a 422.
const Body = z.object({ title: z.string() });          // was: name

// GOOD — accept both, prefer the new one, and state the sunset.
const Body = z
  .object({
    title: z.string().optional(),
    /** @deprecated use `title`; removed after 2026-12-01. */
    name: z.string().optional(),
  })
  .refine((b) => b.title ?? b.name, 'title is required');
```

## Report
- Cite the exact route or contract line. Name the caller that breaks in one
  sentence (even if hypothetical: "any client sending the old field name").
- Give the compatible alternative: keep the old input as optional, add a new
  route or version, or a deprecation window.
- One finding per breaking change; do not repeat the same rename for each of
  its consequences.
