---
name: uncovered-branches
description: For every conditional the diff adds or changes, check that a test exercises each branch; report the first branch with no test as a WARNING with the exact file:line of the untested branch.
type: rubric
---
# Uncovered branches

A happy-path test is not coverage. Every `if` / `else` / `switch` arm / early
`return` / `catch` / optional-chaining fallback that this diff adds or changes
is a branch the tests must drive on purpose.

## Procedure
1. List the branches the production change introduces (both arms count, and
   the error path of every `try` counts as a branch).
2. For each branch, find the test in the diff that forces it: an input that
   makes the condition true AND one that makes it false, a rejected promise for
   the `catch`, an empty collection for the loop-never-runs case.
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
  test.
