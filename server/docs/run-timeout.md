# Run timeout

`RUN_TIMEOUT` sets the wall-clock budget for one agent run, in human-readable
form (`90s`, `5m`, `1h`). Empty means the default of 5 minutes. Parsed by
`parseRunTimeout` in `src/platform/run-timeout.ts`.
