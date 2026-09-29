---
name: contract-first-changes
description: For any API change in the diff, verify the shared Zod contract changed first and drives both validation and serialization; report handlers that parse or shape data by hand, routes without a schema, and contract edits with no test, as WARNING.
type: convention
---
# Contract-first changes

The shared Zod contract is the single source of truth: it validates the
request at the edge (`fastify-type-provider-zod` rejects invalid input with
`422` before the handler runs) and serializes the response. A change that
bypasses it is a change the type system cannot see.

## Rules
1. **Schema on every route.** A new or changed route declares `params`,
   `body` and/or `query` schemas from the shared contracts. Hand-rolled
   `Schema.parse(req.body)` inside a handler, or an unvalidated `/:id`, is a
   WARNING.
2. **Contract before consumer.** When a field is added or changed, the diff
   touches the contract file first (both mirrored copies), then the
   repository / DTO mapper, then the client hook types. A client type edited
   without the contract, or the reverse, is a WARNING.
3. **Same schema in, same schema out.** The response is built from the DTO
   that the contract types — not an ad-hoc object literal that happens to
   match today.
4. **A contract change ships with a test.** The server-side contracts test or
   a route test must exercise the new field / shape; a contract edit with no
   test update is a WARNING.
5. **Enums live in the contract.** A new status / type / kind value is added
   to the Zod enum (and the Drizzle `text({ enum })` list), never as a bare
   string compared in code.

## Report
- Cite the route or handler line that bypasses the contract and the contract
  line that should own the rule.
- Keep it to one finding per bypassed rule.
