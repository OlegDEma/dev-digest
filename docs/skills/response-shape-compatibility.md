---
name: response-shape-compatibility
description: When a handler or DTO mapper changes what a response contains, compare the new shape field by field against the declared contract and every consumer in the diff; report removed, renamed, retyped or newly-nullable fields, and any consumer left reading the old shape.
type: convention
---
# Response-shape compatibility

A response is a promise about field names, types and nullability. Read the
change as the consumer would: which key does the client destructure, what
does it assume is never null, what does a fixture encode?

## Check, field by field
1. **Declared vs produced.** The Zod response contract, the DTO mapper
   (`toXDto`) and the handler must agree on every field. A field the handler
   drops but the contract still declares is a silent `undefined` at the
   consumer; a field the handler adds but the contract omits is stripped by
   serialization.
2. **Nullability.** `.nullable()` / `.nullish()` / `.optional()` changed →
   every consumer that does `x.field.length` or `x.field.toFixed()` is now a
   crash path.
3. **Casing and naming.** Contract fields are `snake_case`, DB rows are
   `camelCase`; a new field must be mapped, not passed through. A rename must
   land in the contract, the mapper, the client hook types, AND the test
   fixtures in the same diff.
4. **Mirrored copies.** When the contract lives in two hand-copied trees, the
   edit must appear in both; a one-sided edit is a WARNING even if the API
   works today.
5. **Enums.** A new enum value the consumer's `switch` does not handle, or a
   removed value that persisted rows still carry.

## Good / bad

```ts
// BAD — cost_usd was non-null; a consumer doing cost_usd.toFixed(2) now crashes.
costUsd: doublePrecision('cost_usd'),
return { cost_usd: run.costUsd };                       // may be null

// GOOD — keep the guarantee at the boundary, or change it deliberately and
// update every consumer in the same PR.
return { cost_usd: run.costUsd ?? 0 };
```

## Report
- WARNING for a declared/produced mismatch on an optional field, a missing
  mirror edit, or a fixture/consumer left on the old shape.
- CRITICAL when a consumer in the diff will crash or a required field is
  removed from a response.
- Cite the contract line AND the consumer line that disagrees.
