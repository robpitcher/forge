# Error Handling Standards

**Proposed by:** Copper  
**Date:** 2026-03-02  
**Context:** Issue #112 code quality review

## Problem

The codebase has inconsistent error handling patterns, particularly around:
- When to use `.catch(() => {})` (fire-and-forget)
- Where to log errors for debugging
- How to surface actionable errors to users

Examples of issues found:
- `updateAuthStatus().catch(() => {})` in callbacks swallows SecretStorage failures
- `console.warn/error` logs go to Extension Host output channel, not the extension's own channel
- Missing await on async cleanup operations

## Proposed Standards

### 1. Fire-and-forget `.catch(() => {})` Policy

**Allowed:**
- Status bar updates triggered by polling/timers (non-critical)
- Background telemetry or analytics

**Not allowed:**
- User-initiated actions (message sends, settings changes, auth operations)
- Resource cleanup operations (session destruction, event unsubscription)
- Any operation whose failure should be visible to the user or developer

**Minimum requirement:** All `.catch(() => {})` must log to output channel:
```typescript
updateAuthStatus(...).catch((err) => {
  outputChannel.appendLine(`[error] Auth status update failed: ${err}`);
});
```

### 2. Logging Standards

- **Create OutputChannel in activate()**: `vscode.window.createOutputChannel("Forge")`
- **Replace all `console.warn/error`** with `outputChannel.appendLine(...)`
- **Format:** `[level] context: message`
  - Levels: `[debug]`, `[info]`, `[warn]`, `[error]`
  - Context: function name or operation (e.g., "session creation", "auth check")

### 3. Async Cleanup

- **Always await async cleanup operations** (`destroySession`, `session.abort()`, `client.stop()`)
- **Wrap in try-catch and log failures** — don't let cleanup errors crash the cleanup path
- **Use finally blocks** for critical cleanup (event unsubscription, timeout clearing)

### 4. User-Facing Error Messages

- **Actionable:** Tell the user what to do, not just what went wrong
  - ❌ "Error: 401 Unauthorized"
  - ✅ "Authentication failed. Click ⚙️ to check your API key."
- **Rewrite SDK errors** to point at settings or sign-in commands
- **Include context** for auth errors (which auth method is configured, what the user should check)

## Impact

- Improves debuggability for users and maintainers
- Prevents silent failures in critical paths
- Establishes clear contract for when errors can be swallowed vs. must be handled

## Action Items

1. Create OutputChannel in activate() and pass to modules that need logging
2. Audit all `.catch(() => {})` callsites and add logging
3. Replace all `console.warn/error` with OutputChannel
4. Add await + try-catch to all async cleanup operations
5. Update error messages to be actionable (already mostly done, but verify consistency)
