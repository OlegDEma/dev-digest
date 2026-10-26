# Research — Project Context (spec `docs/specs/2026-10-11-project-context.md`)

Reports from the spec rounds, saved verbatim so `implementation-planner` does not redo them.

## R1 — investigator: How and when is a repo's clone at `repos.clone_path` updated? (refresh, poller, missing/failed clone, "synced" label)

### Answer
`POST /repos/:id/refresh` enqueues a `clone` job whose handler runs `git fetch` only when `<dir>/.git` already exists. A bare `fetch` moves `origin/*` refs and does not touch the working tree. It also enqueues an incremental index refresh, which does not touch the clone either. The only code that advances the working tree is `GitClient.sync()` (fetch depth 50, then `reset --hard origin/<branch>`). It is reached only through `POST /repos/:id/resync`, which the BlastRadiusCard "Resync" button calls. No background poller exists; `POST /repos/:id/poll` is a manual PR-list sync that never touches the clone. The sidebar label is a static string ("synced" or "not synced"), not "2m ago".

### Definitions
| Symbol | Tree / package | `path:line` |
|--------|----------------|-------------|
| `repos.clone_path` (`clonePath`), `last_polled_at` (`lastPolledAt`) | server Drizzle | `server/src/db/schema/repos.ts:16-17` |
| no repo status or error column (only the two above) | server Drizzle | `server/src/db/schema/repos.ts:5-20` |
| `Repo` contract fields `clone_path`, `last_polled_at` | server vendor/shared | `server/src/vendor/shared/contracts/platform.ts:147-148` |
| `Repo` contract fields `clone_path`, `last_polled_at` | client vendor/shared | `client/src/vendor/shared/contracts/platform.ts:147-148` |
| `SimpleGitClient.clone` / `.sync` / `.clonePathFor` | server adapter | `server/src/adapters/git/simple-git.ts:54`, `:77`, `:37` |
| `GitClient.sync` interface | server vendor/shared | `server/src/vendor/shared/adapters.ts:244` |
| `GitClient` interface (no `sync`, no `diffNameOnly`) | client vendor/shared | `client/src/vendor/shared/adapters.ts:182-191` |
| `RepoService.refresh` / `runCloneJob` | server | `server/src/modules/repos/service.ts:114`, `:51` |
| `RepoIntelService.resyncRepo` | server | `server/src/modules/repo-intel/service.ts:144` |
| `toShellRepo` (builds `syncedLabel`) | client | `client/src/components/app-shell/helpers.ts:7-14` |

### Edges

#### A. What each endpoint does to the working tree
| From (`path:line`) | Kind | To | Read or (inferred) |
|---|---|---|---|
| `server/src/modules/repos/routes.ts:38-41` | call | `POST /repos/:id/refresh` → `RepoService.refresh` | read |
| `server/src/modules/repos/service.ts:117-122` | call | `refresh` enqueues a `clone` job with url `https://github.com/${fullName}.git`. It returns `{status:'refreshing'}` immediately (`:137`). | read |
| `server/src/modules/repos/service.ts:46-48`, `:51-58` | call | `clone` handler → `runCloneJob` → `git.clone(...)`, then `updateClonePath(repoId, path)` | read |
| `server/src/adapters/git/simple-git.ts:57-61` | call | If `<dest>/.git` exists: `simpleGit(dest).fetch()` and return. Plain fetch with no `reset`/`merge`/`pull`, so the working tree and local HEAD do not move. | read |
| `server/src/modules/repos/repository.ts:73-77` | call | `updateClonePath` sets `clonePath` and `lastPolledAt = new Date()`. The clone job therefore bumps `last_polled_at` on every successful run, including refresh. | read |
| `server/src/modules/repos/service.ts:128-133` | call | `refresh` also enqueues `REFRESH_JOB_KIND` (`repo-intel-refresh`). Enqueue errors are swallowed (`:134-136`). | read |
| `server/src/modules/repo-intel/service.ts:177-179` | call | The REFRESH handler runs `refreshIndex` → `runIncremental`. Index only; no git fetch or sync. | read |
| `server/src/modules/repo-intel/pipeline/incremental.ts:85`, `:97-105` | call | `runIncremental` reads `git.currentHead` (local HEAD). If it equals `lastIndexedSha` it only touches `updated_at` (`reason: 'sha_unchanged'`). After a plain `fetch`, local HEAD has not moved, so refresh normally ends here. | read |
| `server/src/modules/repos/service.ts:123-127` (comment) | string ref | Says refresh is "a no-op when `currentHead === lastIndexedSha`". Assumes the clone job advanced HEAD, which `clone()` does not do for an existing `.git`. | read |
| `server/src/modules/repo-intel/routes.ts:43-65` | call | `POST /repos/:id/resync` enqueues `RESYNC_JOB_KIND`. Returns 202 even if the enqueue fails (`:57-59`, `:61-63`). | read |
| `server/src/modules/repo-intel/service.ts:180-182`, `:144-163` | call | Resync handler runs `resyncRepo` → `container.git.sync(ref, repo.defaultBranch)` (`:152`), then `runIncremental` (`:162`). | read |
| `server/src/adapters/git/simple-git.ts:85-87` | call | `sync()` does `fetch origin <branch> --depth 50`, then `reset --hard origin/<branch>`. The only working-tree advance. | read |
| `client/src/lib/hooks/repo-intel.ts:40-44` | call | `useResyncRepoIntel` → `POST /repos/${repoId}/resync` | read |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/BlastRadiusCard.tsx:30`, `:66-72`, `:116-117` | call | The "Resync" button is the only UI caller of `/resync` | read |
| `client/src/lib/hooks/core.ts:82-91` | call | `useRefreshRepo` → `POST /repos/${repoId}/refresh`; invalidates `["repos"]` and `["pulls", repoId]` | read |
| `client/src/app/repos/[repoId]/pulls/page.tsx:36`, `:96-97`; `pulls/_components/FilterBar/FilterBar.tsx:48-56` | call | PR-list "Refresh" button triggers `refresh.mutate(repoId)` | read |
| `server/src/modules/repos/service.ts:98-103` | call | `add` enqueues the first `clone` job; success enqueues `INDEX_JOB_KIND` (`:68-72`). | read |

#### B. The "poller"
| From (`path:line`) | Kind | To | Read or (inferred) |
|---|---|---|---|
| `server/src/modules/polling/routes.ts:10-14`, `:20` | call | `POST /repos/:id/poll` is MANUAL and syncs the PR list only | read |
| `server/src/modules/polling/routes.ts:29-63` | call | `gh.listPullRequests`, upsert `pull_requests`, set `lastPolledAt`. No git call, no `clonePath`. | read |
| `server/src/modules/pulls/routes.ts:26-78` | call | `GET /repos/:id/pulls` upserts PRs from GitHub on every read when a token exists. Does not write `lastPolledAt` or touch the clone. | read |
| `client/src/lib/hooks/core.ts:102-109` | call | `usePulls` has `refetchInterval: 60_000` — the only recurring activity; PR metadata only. | read |
| `server/src/vendor/shared/contracts/platform.ts:88` | type-use | `polling_interval_min` (default 5) is a settings field; no scheduler consumes it. | read (absence by grep) |

#### C. Clone missing or failed
| From (`path:line`) | Kind | To | Read or (inferred) |
|---|---|---|---|
| `server/src/platform/jobs.ts:59-98` | call | Clone failure sets `jobs.status='failed'` with `error`, after `withRetry` (retries 2, `:42`) and 120s timeout (`:41`). | read |
| `server/src/platform/jobs.ts:100-107` | comment | `done` rejections swallowed; failure lives only in the `jobs` row; nothing in `repos` records it. | read |
| `server/src/modules/repos/repository.ts:73-77` | call | `clonePath` written only after `git.clone` succeeds. A failed first clone leaves `clone_path = null`, `last_polled_at = null`. | read |
| `server/src/adapters/git/simple-git.ts:62-64` | call | Leftover dir without `.git` is `rm -rf`ed and re-cloned. | read |
| `server/src/adapters/git/simple-git.ts:57-61` | call | If `clone_path` set but `.git` gone, refresh re-clones with `--depth 1`. | read / `CLONE_DEPTH` inferred |
| `server/src/modules/repo-intel/service.ts:147-149` | call | `resyncRepo` with null `clonePath` → `degraded`, `reason:'no_clone'`. | read |
| `server/src/modules/repo-intel/service.ts:151-161` | call | If `git.sync` throws → `degraded`, `reason: 'sync_failed:<msg>'`. | read |
| `server/src/modules/repo-intel/pipeline/incremental.ts:61-70` | call | `no_clone` → degraded `IndexResult`; no index state row | read |
| `server/src/modules/repo-intel/pipeline/full.ts:84-93` | call | `no_clone` → degraded row in `repo_index_state` | read |
| `server/src/modules/repo-intel/service.ts:190-205` | call | `getIndexState` with no row → synthesized `degraded`/`no_data`; `GET /repos/:id/index-state` (`routes.ts:33-41`). | read |
| `server/src/modules/conventions/service.ts:99-104`, `:195-196` | call | **Only "no clone" error found.** `ValidationError('Nothing to sample — clone and index this repo first, then run the scan again.')`. Test `server/test/conventions.it.test.ts:216`. | read |
| `server/src/modules/repo-intel/service.ts:252`, `:485`, `:606` | call | Callers/blast/signature reads return empty when `!clonePath` | read |
| `server/src/modules/repo-intel/service.ts:817-818` | call | `readClone` swallows read errors → `null` | read |
| `server/src/modules/workspace/routes.ts:22-31` | call | `GET /workspace` exposes `clone_path`, `last_polled_at`, `cloned: Boolean(r.clonePath)` | read |
| `server/src/db/seed.ts:93` | call | Seeded repos have `clonePath: null` | read |

#### D. The sidebar "synced" label
| From (`path:line`) | Kind | To | Read or (inferred) |
|---|---|---|---|
| `client/src/components/app-shell/helpers.ts:12` | call | `syncedLabel: r.last_polled_at ? "synced" : "not synced"` — no relative time | read |
| `client/src/components/app-shell/hooks/useShellContext.ts:65-66` | call | `repos.map(toShellRepo)` and `activeRepo` → shell context | read |
| `client/src/vendor/ui/shell/types.ts:16` | type-use | `RepoSummary.syncedLabel?: string` | read |
| `client/src/vendor/ui/shell/RepoSwitcher.tsx:66` | call | Renders `${default_branch ?? "main"} · ${syncedLabel ?? "not synced"}` | read |
| `server/src/modules/repos/helpers.ts:53` | call | `last_polled_at` DTO mapping | read |
| `client/src/lib/hooks/core.ts:67-72` | call | `useRepos` → `GET /repos`; invalidated after add/refresh/delete | read |

What sets `last_polled_at`: (1) the successful clone job (`repository.ts:76`), which refresh also triggers; (2) manual `POST /repos/:id/poll` (`polling/routes.ts:62`). No relative-time formatter in `client/src`.

### Blast radius (current state relevant to the feature)
- No "document list" or "token counts" UI exists; no `context` route under `client/src/app`. `client/messages/en/context.json` has only `resync`/`resyncing` keys.
- `RefreshCw` buttons: pulls FilterBar (`FilterBar.tsx:51`), conventions "Re-scan" (`conventions/page.tsx:116-124`), Topbar `onRefresh` (`vendor/ui/shell/Topbar.tsx:75`), ErrorState retry (`vendor/ui/primitives/ErrorState.tsx:53`).

### Drift noticed
- T1: `GitClient` differs between vendor trees (server has `sync`, `diffNameOnly`; client doesn't).
- `repos/service.ts:123-127` comment assumes refresh advances HEAD; it doesn't.
- `last_polled_at` is bumped by clone job + manual poll, not a poller; `polling_interval_min` unused.

### Not searched
Git history, curated docs/specs/INSIGHTS, tests beyond hits, `repos/constants.ts`, mcp/e2e/reviewer-core consumers of `clone_path`, boot schedulers, Topbar `onRefresh` wiring.

## R2 — investigator: Does the exported CI runner use reviewer-core's assemblePrompt/reviewPullRequest; where does it resolve skills; can it read repo files; do MCP / multi-agent / eval runs share run-executor?

### Answer
The CI runner is not in this checkout. No `agent-runner/` directory, no `CiService` or export-ci route in `server/src`, no `.devdigest/skills|agents` string outside the `AgentManifest` doc comment. `reviewer-core` is written to be shared with it; its input takes skill bodies already resolved, with no filesystem access. MCP `run_agent_on_pr` and multi-agent (`all:true`) hit `run-executor.ts` through `POST /pulls/:id/review`. No eval path exists in `server/src`.

### Definitions
| Symbol | Tree / package | `path:line` |
|--------|----------------|-------------|
| `AgentManifest` (`skills` slug array) | server vendor/shared | `server/src/vendor/shared/contracts/eval-ci.ts:152-168` (slug → `.devdigest/skills/<slug>.md` only in comment `:144-151`) |
| `AgentManifest` | client vendor/shared | NOT defined (drift) |
| `assemblePrompt` | reviewer-core | `reviewer-core/src/prompt.ts:132` |
| `reviewPullRequest`, `ReviewInput` | reviewer-core | `reviewer-core/src/review/run.ts:143`, `:54` |
| `executeRuns` / `runOneAgent` / `buildSkillBlocks` | server | `server/src/modules/reviews/run-executor.ts:58`, `:153`, `:402` |
| `ReviewService.runReview` / `resolveTargets` | server | `server/src/modules/reviews/service.ts:103`, `:46` |
| `RunRequest {agentId?, all?}` | both trees, identical | `*/vendor/shared/contracts/platform.ts:272-275` |
| Eval/CI tables | server db | `server/src/db/schema/eval.ts:7,22`; `server/src/db/schema/ci.ts:4,14` (schema only) |

### Q1. CI runner and `assemblePrompt`/`reviewPullRequest`
Only comments/docs claim it: `reviewer-core/src/prompt.ts:11-13`, `reviewer-core/package.json:6`, `reviewer-core/src/index.ts:5`, `reviewer-core/README.md:7-9` ("added back in the Export-to-CI lesson, L06"), `INSIGHTS.md:80`. `reviewPullRequest` calls `assemblePrompt` at `run.ts:163`, `:193`. The ONLY real caller of `reviewPullRequest` is `server/src/modules/reviews/run-executor.ts:220`.

### Q2. Skill resolution
- `eval-ci.ts:148-150` comment: studio writes manifest, runner reads it; skills resolve to `.devdigest/skills/<slug>.md`.
- `reviewer-core/src/review/run.ts:26-28`: "caller turns slugs into bodies (DB in the studio, fs in the runner)"; `:65-66` `ReviewInput.skills?: string[]` = resolved bodies.
- `specs/03-skills.md:66` lists the CI runner as a non-goal.
- Studio resolves from DB: `run-executor.ts:208`, `:402-423` (`enabledSkillsForPrompt`); passes `skills` at `:235`.

### Q3. Can a runner read repo files like the studio?
- `reviewer-core` has no fs/DB/GitHub access (`run.ts:21-24`). Repo context arrives as pre-resolved optional strings on `ReviewInput`: `callers` (`:75`), `repoMap` (`:80`), `specs` (`:70`), `memory` (`:67`), `prDescription` (`:83`), `intent` (`:88`).
- Studio builds them from DB-backed `repoIntel` + `container.git` (`run-executor.ts:445,478,501`; `diff-loader.ts:20,29,33-43`; `run-executor.ts:238`).
- `AgentManifest` has no field for repo map, callers, memory or specs.

### Q4. Other paths into `run-executor.ts`
| From | Kind | To |
|---|---|---|
| `server/src/modules/reviews/service.ts:133` | call | `executor.executeRuns` (only caller) |
| `run-executor.ts:129` | call | `runOneAgent` per job |
| `server/src/modules/reviews/routes.ts:30-47` | call | `POST /pulls/:id/review` → `resolveTargets` → `runReview` |
| `mcp/src/tools/run-agent-on-pr.ts:54` → `mcp/src/run-review.ts:34` → `mcp/src/api/http.ts:51-52` | call | `POST /pulls/${prId}/review` with `{agentId}` (never `all`); attaches to active run first (`run-review.ts:25-33`) |
| `reviews/service.ts:50` | call | `all:true` → `agents.listEnabled`, sequential loop `run-executor.ts:122-149` |
| `server/src/app.ts:87` | call | boot reaper only |

No eval/ci module registered (`server/src/modules/index.ts:2-14`).

### Drift noticed
- `AgentManifest` missing from client vendor tree (`INSIGHTS.md:41`).
- Stale `INSIGHTS.md:56` (run-executor now passes `skills`).
- `reviewer-core/README.md:31-35` understates what the server passes.
- `traceFromBuffer` hard-codes `source: 'local'` (`run-executor.ts:531`).

### Scope implication (facts)
- CI: no runner code exists.
- Multi-agent (`all:true`) and MCP `run_agent_on_pr` execute through `run-executor.ts`, so a change there affects them.
- Eval: DB tables and contracts only.

## R3 — investigator: How is "an agent uses a skill" computed; "N agents" counts; are disabled agents/skills counted?

### Answer
"Uses" = a row in `agent_skills` (no `enabled` column). "Used by N agents" on skill cards and Stats counts every `agent_skills` row for the skill, ignoring `agents.enabled` and `skills.enabled`. Only prompt assembly filters: `enabledSkillsForPrompt` drops bound skills with `skills.enabled = false`; it never looks at `agents.enabled`. No document inheritance through skills exists in server code.

### Definitions
| Symbol | `path:line` |
|--------|-------------|
| `agent_skills` (`agent_id`, `skill_id`, `order`, PK both, FKs cascade) | `server/src/db/schema/agents.ts:51-63` |
| `agents.enabled` | `server/src/db/schema/agents.ts:32` |
| `AgentsRepository.enabledSkillsForPrompt` | `server/src/modules/agents/repository.ts:212-220` |
| `AgentsRepository.linkedSkills` (no filter) | `server/src/modules/agents/repository.ts:192-200` |
| `AgentsRepository.skillCounts` | `server/src/modules/agents/repository.ts:223-231` |
| `AgentsRepository.listEnabled` | `server/src/modules/agents/repository.ts:58-63` |
| `SkillsRepository.usedByCounts` | `server/src/modules/skills/repository.ts:51-59` |
| `SkillsRepository.agentsUsing` | `server/src/modules/skills/repository.ts:128-135` |
| `SkillSummary.used_by`, `SkillStats.used_by` | `*/vendor/shared/contracts/knowledge.ts:140-141, 158-159` (both trees) |
| `Agent.skill_count` | server `knowledge.ts:311-313`, client `:305-307` |

### Edges
| From | Kind | To |
|---|---|---|
| `skills/service.ts:57-68` | call | `usedByCounts` → `used_by` for every skill |
| `skills/repository.ts:53-57` | query | `agent_skills ⋈ skills` by workspace, group by skill; no enabled filters; no `agents` join |
| `skills/service.ts:75-93` | call | `agentsUsing` → `used_by: agents.length` (`:85`) |
| `skills/repository.ts:129-134` | query | `agent_skills ⋈ agents`; no `agents.enabled` filter |
| `skills/service.ts:132-139`, `skills/routes.ts:125` | call | `GET /skills/:id/agents` uses `agentsUsing` |
| `SkillRailCard.tsx:110` | string ref | `rail.stats.agents` with `skill.used_by` (`client/messages/en/skills.json:25`) |
| `StatsTab.tsx:37` | string ref | "Used by" tile |
| `agents/service.ts:58-65`, `agents/repository.ts:225-229` | call/query | `skill_count`, no `skills.enabled` filter |
| `AgentCard.tsx:81-83` | string ref | `card.skillCount` |
| `run-executor.ts:208`, `:402-403` | call | `buildSkillBlocks` → `enabledSkillsForPrompt` |
| `agents/repository.ts:217` | query | `agentSkills.agentId = :id AND skills.enabled = true`, ordered by `agent_skills.order` |
| `run-executor.ts:418-421` | call | `recordRunSkills` → `agent_run_skills` (enabled only) |
| `reviews/service.ts:50` / `:51-55` | call | `all:true` skips disabled agents; by `agentId` no enabled check |
| `agents/service.ts:152-161,164-176`, `agents/routes.ts:160-161`, `agents/repository.ts:234-261` | call | `setSkills` (delete-all + insert order=index) / `linkSkill` (upsert); no same-workspace check on skill |
| `server/test/skills.it.test.ts:142,244-247,263-272,299,328` | test | `used_by`, `skill_count`, `/skills/:id/agents`, disabled-skill run |

### Behaviour matrix
| Case | "Used by" (skill card/Stats) | `skill_count` | Skill in prompt |
|---|---|---|---|
| Skill bound, `skills.enabled=false` | counted | counted | NOT included |
| Skill bound to disabled agent | counted | counted | included if run by id; "run all" skips disabled agents |
| No link | 0 | n/a | n/a |

### Inheritance through skills
Nothing ties documents/specs to skills or agents. The only transitive path is agent → `agent_skills` → skill body (`### <name>\n<body>`, `run-executor.ts:410-411`). `prompt_assembly.memory`/`specs` set null at `run-executor.ts:534`.

### Blast radius (if "Used by" were redefined)
`skills/repository.ts:51-59`, `:128-135`; `agents/repository.ts:223-231`; `server/test/skills.it.test.ts`; client `used_by` fixtures; `knowledge.ts` in both trees only if a field is added; `specs/03-skills.md:52, 309` (intended definition: binding rows; no per-link `enabled`).

### Drift noticed
- `Agent.skill_count` at a 6-line offset between trees (content between 167–305 differs; not diffed).
- `INSIGHTS.md:56` stale (run-executor passes `skills` now; fix recorded at `INSIGHTS.md:151`).
