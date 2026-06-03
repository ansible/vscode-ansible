# Build tools

Use Node (`.mts`) for build scripts so they run on native Windows without Python.

| Script | Purpose |
| --- | --- |
| `helper.mts` | Version (`--version`), package VSIX (`--package`), publish (`--publish`); Task `VERSION` uses `--version` |
| `finish.mts` | Post-build/test checks: `vitest list` stderr must be empty, working tree must be clean |
| `helper` | Bash launcher → `node helper.mts` (Unix / Git Bash) |
