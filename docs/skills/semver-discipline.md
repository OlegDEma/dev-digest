---
name: semver-discipline
description: Judge every API and contract change against the version it ships under; report a breaking change released without a major bump, a behaviour change shipped as a patch, and any version bump that does not match the diff, as CRITICAL.
type: rubric
---
# Semver discipline

A version number is a promise about what upgrading costs. The diff either keeps
that promise or it does not, and only the diff can tell you — the number itself
is just an assertion.

## The rule
- **MAJOR** — anything an existing caller must change code for: a removed or
  renamed route, field or export; a newly required input; a narrowed type;
  a changed status code or error envelope.
- **MINOR** — new capability, fully backward compatible: a new route, a new
  optional input, a new response field.
- **PATCH** — a fix that changes no signature and no documented behaviour.

## What to report
- A breaking change (by the list above) shipped as MINOR or PATCH → **CRITICAL**.
- A behaviour change — different default, different ordering, different rounding
  — shipped as PATCH → **WARNING**; callers pin patches expecting safety.
- A version bumped in `package.json` with nothing in the diff to justify it, or a
  breaking diff with no bump at all → **WARNING**, and say which it should be.
- Pre-1.0 (`0.x`) does not suspend the rule: it moves it down a place (breaking →
  minor bump). Say so rather than staying silent.

## Good / bad

```diff
- "version": "2.4.1"
+ "version": "2.4.2"          // BAD — the same diff removes GET /skills/:id/stats
```

```diff
- "version": "2.4.1"
+ "version": "3.0.0"          // GOOD — removal is a major; note it in the changelog
```

## Report
- Name the change, the version it ships under, and the version it needs.
- One finding per mismatched release, not per changed file.
