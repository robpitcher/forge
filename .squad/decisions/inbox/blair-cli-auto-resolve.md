# Decision: Auto-resolve copilot CLI path in getOrCreateClient

**By:** Blair (Extension Dev)
**Date:** 2025-07-25
**Context:** .vsix sideload fails because SDK's `getBundledCliPath()` calls `import.meta.resolve('@github/copilot/sdk')` which the esbuild shim cannot resolve without `node_modules`.

## Decision

`getOrCreateClient()` now auto-resolves the copilot CLI binary from PATH using `which`/`where` before constructing `SDKCopilotClient`. This provides `cliPath` explicitly so the SDK never calls `getBundledCliPath()`.

**Fallback chain:**
1. `config.cliPath` set → use it (unchanged)
2. `config.cliPath` empty → try `which copilot` / `where copilot` on PATH
3. PATH lookup fails → let SDK try its bundled path (works in dev, fails in .vsix → caught by error handler)

Also added `"cannot resolve"` to the error detection patterns to match the exact error the esbuild shim throws.

## Impact

- All agents: no changes needed to callers of `getOrCreateClient()`
- Windows (tests): air-gap test updated to accept auto-resolved cliPath
- Users: .vsix sideload now works if `copilot` is on PATH without manual config
