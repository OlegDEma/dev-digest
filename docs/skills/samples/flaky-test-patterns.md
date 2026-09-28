---
name: flaky-test-patterns
description: Flag any test in the diff whose outcome depends on real time, wall-clock ordering, the network, randomness or test order; report each mechanism as a WARNING with the line that introduces it and the deterministic replacement.
type: convention
---
# Flaky test patterns

A test that can fail without the code changing is worse than no test: it
trains people to re-run and ignore. Report the MECHANISM you can see in the
diff, never a hunch.

## Mechanisms to flag
- **Real timers.** `setTimeout` / `setInterval` awaited in a test, `sleep()`
  helpers, waiting "long enough" → use fake timers (`vi.useFakeTimers()`) or
  poll a condition with a bounded timeout.
- **Wall clock.** `Date.now()` / `new Date()` compared against a computed
  expectation → freeze time or inject a clock.
- **Randomness.** `Math.random`, uuids, or shuffled fixtures feeding an
  assertion → seed or stub.
- **Network / filesystem / environment.** A fetch to a real host, reading a
  file outside the fixture dir, depending on `process.env` set by the machine
  → mock at the boundary via the injected adapter.
- **Order dependence.** A test that reads state written by an earlier test
  (shared array, a DB row without a unique key per test, a module-level cache)
  → own the setup per test, use unique names / ids.
- **Racing a background job.** Asserting right after firing async work
  without awaiting a terminal state → wait for the row / event, with a
  timeout that fails loudly.

## Severity
- WARNING per mechanism, citing the test line that introduces it.
- CRITICAL only when the diff's test already relies on a retry / re-run to be
  green (visible `retry`, `.skip` with a "flaky" note, or a loosened timeout).
