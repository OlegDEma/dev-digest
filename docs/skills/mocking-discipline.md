---
name: mocking-discipline
description: When a test in the diff mocks a collaborator, verify the test still proves something about the real code; report mocks that replace the unit under test, mocks asserted against their own return, and integration paths mocked away, as WARNING (CRITICAL if the test can no longer fail).
type: convention
---
# Mocking discipline

Mock the boundary, not the behaviour. A mock is acceptable when it replaces
I/O the test cannot own (network, clock, a third-party SDK) and the assertion
still runs the real code path that the diff changed.

## Smells to report
- **Mocking the unit under test.** The function the diff changed is stubbed
  in its own test (`vi.mock` of the module being tested, or spying on the
  method and returning a fixed value) — the test now proves nothing.
- **Asserting the mock's own return.** `mock.mockResolvedValue(x)` followed by
  `expect(result).toEqual(x)` with no real logic in between.
- **Over-wide mocks.** `vi.mock('../db')` or `vi.mock('fs')` replacing a whole
  module when only one call needed stubbing, hiding every other behaviour.
- **Mocked persistence in an integration test.** A `*.it.test.ts` that stubs
  the repository or the DB — the integration lane exists to catch SQL and
  wiring; mocking it there defeats the lane.
- **Mocks never reset.** `vi.fn()` state shared across tests without
  `mockReset` / `restoreAllMocks`, so a later test passes on an earlier
  test's calls.

## Severity
- CRITICAL when, because of the mock, the test cannot fail for the code the
  diff changed.
- WARNING for the other smells.

## Prefer
- Inject the collaborator (a port on the container) and pass the repo's
  existing mock adapters (`adapters/mocks.ts`) rather than `vi.mock`-ing a
  module path.
- Assert on behaviour the real code produced (persisted rows, the shape sent
  to the boundary), not on the number of calls to the mock.
