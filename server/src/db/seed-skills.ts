import type { SkillType } from '@devdigest/shared';

/**
 * Built-in skills used by the seed — the guidance bound to the Test Quality
 * and API Contract reviewers (specs/03-skills.md §7).
 *
 * These mirror the human-readable originals in `docs/skills/*.md` (frontmatter
 * = name/description/type, body = everything after it). Keep the two in sync
 * when you edit a skill, exactly as `seed-prompts.ts` mirrors
 * `docs/agent-prompts/`. The DB row is the source of truth at run time; editing
 * a body here only affects freshly seeded workspaces.
 */

export interface SeedSkill {
  name: string;
  /** The skill's interface: a directive the agent reads as an instruction. */
  description: string;
  type: SkillType;
  /** Markdown, appended to the prompt as a `### <name>` block. */
  body: string;
}

/** Bound to the Test Quality Reviewer, in this order. */
export const TEST_QUALITY_SKILLS: readonly SeedSkill[] = [
  {
    name: 'uncovered-branches',
    description:
      'For every conditional the diff adds or changes, check that a test exercises each branch; report the first branch with no test as a WARNING with the exact file:line of the untested branch.',
    type: 'rubric',
    body: `# Uncovered branches

A happy-path test is not coverage. Every \`if\` / \`else\` / \`switch\` arm / early
\`return\` / \`catch\` / optional-chaining fallback that this diff adds or changes
is a branch the tests must drive on purpose.

## Procedure
1. List the branches the production change introduces (both arms count, and
   the error path of every \`try\` counts as a branch).
2. For each branch, find the test in the diff that forces it: an input that
   makes the condition true AND one that makes it false, a rejected promise for
   the \`catch\`, an empty collection for the loop-never-runs case.
3. Report the branches that have no such test. Cite the production line of the
   untested branch, and say what input would drive it.

## Severity
- WARNING when a branch that changes behaviour (a different return, a thrown
  error, a skipped write) has no test.
- CRITICAL only when the untested branch is the one that guards a failure mode
  (auth check, validation reject, error handling) and the diff's own test
  asserts the opposite arm as if it were the whole story.

## Do not
- Do not ask for tests of code the diff did not touch.
- Do not count a mock's return value as exercising a branch in the code under
  test.`,
  },
  {
    name: 'boundary-and-corner-cases',
    description:
      'When a diff changes logic over collections, numbers, strings, dates or optional values, check the tests for the boundary inputs listed here and report each missing corner case as a WARNING naming the exact input.',
    type: 'rubric',
    body: `# Boundary and corner cases

The bugs live at the edges. For each unit of logic the diff changes, check
whether the tests drive the edge inputs that apply — and name the specific
missing input, not "add more tests".

## Checklist (apply what fits the type of the input)
- **Collections:** empty; exactly one; the maximum / page-size boundary;
  duplicates; already-sorted vs reversed when order matters.
- **Numbers:** 0; negative; the off-by-one at each inclusive/exclusive bound;
  \`NaN\` / \`Infinity\` when parsing; integer overflow for ids and counts.
- **Strings:** empty; whitespace-only; unicode / emoji length; leading or
  trailing separators; a value that equals the delimiter.
- **Optionals:** \`null\` vs \`undefined\` vs missing key; an explicit empty
  object; a default that is falsy (\`0\`, \`""\`, \`false\`) and must NOT be
  replaced by \`??\` / \`||\`.
- **Time:** midnight and month/year rollover; DST; a timestamp exactly at the
  cutoff; clock skew between "now" captured twice.
- **Concurrency / retries:** the same operation applied twice (idempotency);
  the second call arriving before the first completes.

## Report
- One WARNING per missing corner case that the diff's logic actually branches
  on; cite the production line whose behaviour at that input is unproven and
  state the input verbatim (e.g. \`items = []\`, \`limit = 0\`).
- SUGGESTION when the edge is plausible but the code path clearly handles it by
  construction.

## Do not
- Do not list every bullet above; only the ones the changed code can reach.`,
  },
  {
    name: 'mocking-discipline',
    description:
      'When a test in the diff mocks a collaborator, verify the test still proves something about the real code; report mocks that replace the unit under test, mocks asserted against their own return, and integration paths mocked away, as WARNING (CRITICAL if the test can no longer fail).',
    type: 'convention',
    body: `# Mocking discipline

Mock the boundary, not the behaviour. A mock is acceptable when it replaces
I/O the test cannot own (network, clock, a third-party SDK) and the assertion
still runs the real code path that the diff changed.

## Smells to report
- **Mocking the unit under test.** The function the diff changed is stubbed
  in its own test (\`vi.mock\` of the module being tested, or spying on the
  method and returning a fixed value) — the test now proves nothing.
- **Asserting the mock's own return.** \`mock.mockResolvedValue(x)\` followed by
  \`expect(result).toEqual(x)\` with no real logic in between.
- **Over-wide mocks.** \`vi.mock('../db')\` or \`vi.mock('fs')\` replacing a whole
  module when only one call needed stubbing, hiding every other behaviour.
- **Mocked persistence in an integration test.** A \`*.it.test.ts\` that stubs
  the repository or the DB — the integration lane exists to catch SQL and
  wiring; mocking it there defeats the lane.
- **Mocks never reset.** \`vi.fn()\` state shared across tests without
  \`mockReset\` / \`restoreAllMocks\`, so a later test passes on an earlier
  test's calls.

## Severity
- CRITICAL when, because of the mock, the test cannot fail for the code the
  diff changed.
- WARNING for the other smells.

## Prefer
- Inject the collaborator (a port on the container) and pass the repo's
  existing mock adapters (\`adapters/mocks.ts\`) rather than \`vi.mock\`-ing a
  module path.
- Assert on behaviour the real code produced (persisted rows, the shape sent
  to the boundary), not on the number of calls to the mock.`,
  },
];

/** Bound to the API Contract Reviewer, in this order. */
export const API_CONTRACT_SKILLS: readonly SeedSkill[] = [
  {
    name: 'breaking-change-detector',
    description:
      'Treat every existing route and shared contract as having callers you cannot see; when the diff changes a route path, HTTP method, required input, status code or response shape, report it as CRITICAL unless the old signature is kept, versioned or explicitly deprecated.',
    type: 'rubric',
    body: `# Breaking-change detector

The API surface is public. An existing caller — a client bundle, a CI runner,
another service, a saved fixture — is written against the previous signature
and will not be updated by this PR. The diff cannot see those callers, so the
policy is: assume they exist.

## What counts as breaking (report as CRITICAL)
- Changing a route **path** or **method**, or renaming / re-ordering a path
  parameter (\`/skills/:id\` → \`/skill/:id\`, \`GET\` → \`POST\`).
- Making an optional input **required**, removing an accepted input, or
  narrowing a type / enum / validation rule so a previously valid request now
  fails.
- **Removing or renaming** a field in a response, making a non-null field
  nullable, or changing a field's type.
- Changing a **status code** or the error envelope a caller branches on.
- Changing a shared Zod contract in a way that fails \`parse()\` on data the
  previous version produced (including rows already persisted).

## What is compatible (do not report as breaking)
- Adding an **optional** input with a default.
- Adding a response field. (Say so explicitly when the consumer is known to
  validate strictly and reject unknown keys.)
- Loosening validation; adding a new route beside the old one.
- A change shipped **with** the old signature still served (a versioned path,
  a deprecation window, an alias) — mention the sunset plan if there is none.

## Good / bad

\`\`\`ts
// BAD — every existing caller sending { name } now gets a 422.
const Body = z.object({ title: z.string() });          // was: name

// GOOD — accept both, prefer the new one, and state the sunset.
const Body = z
  .object({
    title: z.string().optional(),
    /** @deprecated use \`title\`; removed after 2026-12-01. */
    name: z.string().optional(),
  })
  .refine((b) => b.title ?? b.name, 'title is required');
\`\`\`

## Report
- Cite the exact route or contract line. Name the caller that breaks in one
  sentence (even if hypothetical: "any client sending the old field name").
- Give the compatible alternative: keep the old input as optional, add a new
  route or version, or a deprecation window.
- One finding per breaking change; do not repeat the same rename for each of
  its consequences.`,
  },
  {
    name: 'response-shape-compatibility',
    description:
      'When a handler or DTO mapper changes what a response contains, compare the new shape field by field against the declared contract and every consumer in the diff; report removed, renamed, retyped or newly-nullable fields, and any consumer left reading the old shape.',
    type: 'convention',
    body: `# Response-shape compatibility

A response is a promise about field names, types and nullability. Read the
change as the consumer would: which key does the client destructure, what
does it assume is never null, what does a fixture encode?

## Check, field by field
1. **Declared vs produced.** The Zod response contract, the DTO mapper
   (\`toXDto\`) and the handler must agree on every field. A field the handler
   drops but the contract still declares is a silent \`undefined\` at the
   consumer; a field the handler adds but the contract omits is stripped by
   serialization.
2. **Nullability.** \`.nullable()\` / \`.nullish()\` / \`.optional()\` changed →
   every consumer that does \`x.field.length\` or \`x.field.toFixed()\` is now a
   crash path.
3. **Casing and naming.** Contract fields are \`snake_case\`, DB rows are
   \`camelCase\`; a new field must be mapped, not passed through. A rename must
   land in the contract, the mapper, the client hook types, AND the test
   fixtures in the same diff.
4. **Mirrored copies.** When the contract lives in two hand-copied trees, the
   edit must appear in both; a one-sided edit is a WARNING even if the API
   works today.
5. **Enums.** A new enum value the consumer's \`switch\` does not handle, or a
   removed value that persisted rows still carry.

## Good / bad

\`\`\`ts
// BAD — cost_usd was non-null; a consumer doing cost_usd.toFixed(2) now crashes.
costUsd: doublePrecision('cost_usd'),
return { cost_usd: run.costUsd };                       // may be null

// GOOD — keep the guarantee at the boundary, or change it deliberately and
// update every consumer in the same PR.
return { cost_usd: run.costUsd ?? 0 };
\`\`\`

## Report
- WARNING for a declared/produced mismatch on an optional field, a missing
  mirror edit, or a fixture/consumer left on the old shape.
- CRITICAL when a consumer in the diff will crash or a required field is
  removed from a response.
- Cite the contract line AND the consumer line that disagrees.`,
  },
  {
    name: 'contract-first-changes',
    description:
      'For any API change in the diff, verify the shared Zod contract changed first and drives both validation and serialization; report handlers that parse or shape data by hand, routes without a schema, and contract edits with no test, as WARNING.',
    type: 'convention',
    body: `# Contract-first changes

The shared Zod contract is the single source of truth: it validates the
request at the edge (\`fastify-type-provider-zod\` rejects invalid input with
\`422\` before the handler runs) and serializes the response. A change that
bypasses it is a change the type system cannot see.

## Rules
1. **Schema on every route.** A new or changed route declares \`params\`,
   \`body\` and/or \`query\` schemas from the shared contracts. Hand-rolled
   \`Schema.parse(req.body)\` inside a handler, or an unvalidated \`/:id\`, is a
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
   to the Zod enum (and the Drizzle \`text({ enum })\` list), never as a bare
   string compared in code.

## Report
- Cite the route or handler line that bypasses the contract and the contract
  line that should own the rule.
- Keep it to one finding per bypassed rule.`,
  },
  {
    name: 'semver-discipline',
    description:
      'Judge every API and contract change against the version it ships under; report a breaking change released without a major bump, a behaviour change shipped as a patch, and any version bump that does not match the diff, as CRITICAL.',
    type: 'rubric',
    body: `# Semver discipline

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
- A version bumped in \`package.json\` with nothing in the diff to justify it, or a
  breaking diff with no bump at all → **WARNING**, and say which it should be.
- Pre-1.0 (\`0.x\`) does not suspend the rule: it moves it down a place (breaking →
  minor bump). Say so rather than staying silent.

## Good / bad

\`\`\`diff
- "version": "2.4.1"
+ "version": "2.4.2"          // BAD — the same diff removes GET /skills/:id/stats
\`\`\`

\`\`\`diff
- "version": "2.4.1"
+ "version": "3.0.0"          // GOOD — removal is a major; note it in the changelog
\`\`\`

## Report
- Name the change, the version it ships under, and the version it needs.
- One finding per mismatched release, not per changed file.`,
  },
  {
    name: 'deprecation-policy',
    description:
      'Require every removal to be preceded by a deprecation that callers can act on; report anything deleted without a prior deprecated period, and any deprecation with no replacement, no sunset date or no runtime signal, as WARNING — or CRITICAL when the surface is public.',
    type: 'convention',
    body: `# Deprecation policy

Removing something is the last step, never the first. A caller you cannot see
needs a window in which the old path still works AND they can find out it is
going away.

## A deprecation is complete only with all four
1. **The old path still works**, unchanged, for the whole window.
2. **A named replacement** — "use \`title\`", "use \`POST /v2/reviews\`". "Removed" is
   not a migration path.
3. **A sunset date or release**, not "soon".
4. **A signal at runtime or build time** — a \`@deprecated\` JSDoc tag (the editor
   shows it), a \`Deprecation\` response header, or a one-line server log. A note
   in a changelog nobody reads is not a signal.

## What to report
- A route, export, field or enum value **deleted with no prior deprecation** →
  WARNING; CRITICAL if it is on the public API surface.
- A \`@deprecated\` tag with no replacement or no date → WARNING.
- A sunset date already in the past with the code still present → WARNING, the
  window has lost its meaning.
- A deprecation added **and** the thing removed in the same PR → WARNING: the
  window is zero.

## Good / bad

\`\`\`ts
// BAD — the route simply disappears; every existing caller 404s on deploy.
- app.get('/skills/:id/stats', handler);
\`\`\`

\`\`\`ts
// GOOD — keep serving it, point at the replacement, sunset it on a date.
/** @deprecated use \`GET /skills/:id/metrics\`; removed after 2026-12-01. */
app.get('/skills/:id/stats', async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
  return handler(req, reply);
});
\`\`\`

## Report
- Cite the removed or deprecated line, name the replacement, and give the window.
- One finding per removed surface.`,
  },
];
