# Decision: Use execFileSync for user-configurable paths

**By:** Childs
**Date:** 2026-03-03
**Context:** PR review found command injection vulnerability in `validateCopilotCli()`

## Decision

When executing external binaries where the **path comes from user configuration** (e.g., `forge.copilot.cliPath`), always use `execFileSync` / `execFile` with an argv array — never `execSync` with string interpolation.

`execSync` runs through a shell, making it vulnerable to command injection and quoting breakage (especially on Windows). `execFileSync` bypasses the shell entirely.

## Scope

- `validateCopilotCli()` — now uses `execFileSync(cliPath, ["--version"], ...)`
- `resolveCopilotCliFromPath()` — still uses `execSync` for `which`/`where` (hardcoded, no user input — acceptable)
- `credentialProvider.ts` — uses `execSync` for `az` CLI commands (hardcoded commands — acceptable)

## Rule

**Any future code that executes a binary path from user config MUST use `execFileSync`/`execFile` with argv, not `execSync` with template strings.**
