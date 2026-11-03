# agent-runner

JS GitHub Action that runs one DevDigest agent against a pull request. Consumes
`reviewer-core` and `@devdigest/shared` as TypeScript source (tsconfig paths) and
bundles everything into `dist/index.js` with `@vercel/ncc`. **`dist/` is committed**
(GitHub runs `action.yml` `main` as-is; root `.gitignore` un-ignores it) — rebuild
with `npm run build` and commit it whenever `src/` changes. npm only.

```
npm run typecheck && npm test && npm run build
```

## Behaviour

- Reads `.devdigest/agents/*.yaml` (exactly one; validated with `AgentManifest`) and
  `.devdigest/skills/<slug>.md` relative to the working directory (needs a checkout).
- Env: `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, and the standard `GITHUB_REPOSITORY`,
  `GITHUB_EVENT_PATH`, `GITHUB_SHA`. Secrets are read from env only and never logged.
- Providers: `openrouter` only. Any other manifest provider exits 1 with
  "provider <p> is not supported in CI (only openrouter)".
- `post_as`: `github_review` (default) | `pr_comment` | `none`. Exit 1 when the
  `ci_fail_on` gate trips or anything fails.
- Always writes `devdigest-result.json` (`CiResultArtifact`) to the working directory,
  also on failure, for the workflow's `if: always()` upload step.

## E0 verification (2026-10-29)

| Item | Result |
|---|---|
| `@vercel/ncc` version | `npm view` -> 0.45.0, pinned exactly |
| `yaml` version | `npm view` -> 2.9.1, installed as `^2.6.1` range (resolves 2.9.x) |
| `uses: owner/repo/subdir@ref` -> `subdir/action.yml`, `runs.using: node20` | NOT verified — no web access; `action.yml` placed in `agent-runner/`. Confirm at V57 |
| `OpenRouterProvider` accepts an OpenAI base URL | Yes (`baseURL`, `id: 'openai'` options in `reviewer-core/src/llm/openrouter.ts`); not wired — owner chose openrouter only |

## Known differences from studio runs

- **Skill header.** The manifest carries skill slugs only, so the CI prompt's skill
  blocks are headed by the slug (`### security-rules`), while studio and eval runs
  use the skill name (`### Security Rules`). The body is identical. The manifest
  contract is deliberately not changed.
- **Provider.** `openrouter` only. Any other provider exits 1.
- **One manifest per repo.** Exactly one `.devdigest/agents/*.yaml` is allowed; zero
  or several is an error.
- **Policy comes from the base commit.** On `pull_request` events GitHub runs the
  workflow and reads `.devdigest/` from the merge ref's base, so on the very first
  publish PR the manifest does not exist yet and the check fails until that PR is
  merged. This is expected.

## Live CI runbook (V57)

1. Build and commit the bundle: `cd agent-runner && npm ci && npm run build`, then
   commit `agent-runner/dist/` (all files: `index.js`, `382.index.js`, `package.json`).
2. Tag and push: `git tag agent-runner-v1 && git push origin <branch> agent-runner-v1`.
3. In `server/.env` set
   `DEVDIGEST_RUNNER_REF=OlegDEma/dev-digest/agent-runner@agent-runner-v1` and restart
   the API.
4. In the studio, open an agent -> CI tab -> Publish to a test repo (connect it first).
   Merge the PR it opens (see "Policy comes from the base commit").
5. In the test repo, add the Actions secret `OPENROUTER_API_KEY`
   (Settings -> Secrets and variables -> Actions). `GITHUB_TOKEN` is provided by Actions.
6. Open a PR in the test repo; confirm the review is posted per `post_as` and the
   `devdigest-result` artifact is present.
7. In the studio, open CI Runs and click Refresh; the run should be ingested.
   If the repo is private, allow access to the runner repo under
   Settings -> Actions -> General -> Access.
