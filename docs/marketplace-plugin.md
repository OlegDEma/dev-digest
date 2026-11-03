# sdd-engineering from the team marketplace

This project installs the spec-driven development plugin `sdd-engineering` from the DevDigest team marketplace, on the **stable channel**, project scope. The plugin is self-contained: it needs no file from this repository.

| What | Value |
| :- | :- |
| Marketplace | `dev-digest-ai-marketplace-stable` ([OlegDEma/devdigest_team_ai_marketplace](https://github.com/OlegDEma/devdigest_team_ai_marketplace), ref `stable`) |
| Plugin | `sdd-engineering` 1.0.0 |
| Dependencies (installed automatically) | `engineering-paved-path` 1.0.0, `research-tools` 1.0.0, `architecture-review` 1.0.0 |
| Config | `enabledPlugins` and `extraKnownMarketplaces` in [`.claude/settings.json`](../.claude/settings.json) |

The same file switches the **main** channel of the marketplace off for this project (`"…@dev-digest-ai-marketplace": false`), so that only one version of each plugin is active even when a developer has the main channel installed for themselves.

## Use

Claude Code asks to trust the marketplace and install the plugins the first time the folder is opened. The commands are namespaced:

```text
/sdd-engineering:spec          # spec-creator rounds
/sdd-engineering:run-plan plan:docs/plans/<feature>.md
/sdd-engineering:workflow-retro
```

The local `/spec`, `/run-plan` and the `.claude/agents/*` copies in this repository are unchanged and keep working under their own names; the plugin does not replace them.

## Verify

```bash
claude plugin list --json    # sdd-engineering and 3 dependencies: 1.0.0, enabled, no errors
```

The active version is also visible in the `init` event of a session trace: `claude -p "ok" --output-format stream-json --verbose` lists every loaded plugin with its `version` and cache path.

## Update and roll back

Stable moves only when a new version has passed the marketplace checks ([STABLE-CHANNEL.md](https://github.com/OlegDEma/devdigest_team_ai_marketplace/blob/main/docs/STABLE-CHANNEL.md)). Update with `claude plugin marketplace update dev-digest-ai-marketplace-stable`. To get the newest, unpromoted version instead, use the main channel: replace the `-stable` names in `.claude/settings.json` with `dev-digest-ai-marketplace` and drop the ref.
