# Decision: _sendConfigStatus Must Send UI-Critical Data Before Slow Auth Checks

**Date:** 2025-01-22  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Context

The extension appeared completely frozen on Windows machines with proper configuration (endpoint, models, Azure CLI logged in). Root cause: `_sendConfigStatus()` gated ALL webview messages (including models list) behind `checkAuthStatus()`, which uses `DefaultAzureCredential`. On Windows, this can hang for 15-60 seconds trying IMDS (managed identity endpoint 169.254.169.254 timeout) before falling through to Azure CLI.

## Decision

**UI-critical data (models, endpoint status) must be sent IMMEDIATELY before slow async operations like credential checks.**

### Implementation Pattern

```typescript
private _sendConfigStatus(prefetched?, isCheckRequest = false): void {
  const doWork = async () => {
    // 1. Get config synchronously (no await for models/endpoint)
    const syncConfig = getConfiguration();
    
    // 2. Send models/endpoint info IMMEDIATELY
    this._view?.webview.postMessage({ type: "modelsUpdated", models: syncConfig.models });
    this._view?.webview.postMessage({ type: "configStatus", hasAuth: false, ... });
    
    // 3. THEN do async auth check with timeout
    const status = await withTimeout(checkAuthStatus(...), 15000, "Auth timed out");
    
    // 4. Send updated status after auth completes
    this._view?.webview.postMessage({ type: "configStatus", hasAuth: true, ... });
  };
  doWork().catch((error) => {
    this._outputChannel.appendLine(`Error: ${error.message}`);
  });
}
```

### Key Principles

1. **Non-blocking reads first:** Use synchronous `getConfiguration()` for VS Code settings (no SecretStorage).
2. **Send preliminary state:** Webview gets models/endpoint immediately; auth status follows when ready.
3. **Timeout long operations:** Wrap `DefaultAzureCredential.getToken()` with 15-second timeout.
4. **Log, don't swallow:** Replace `.catch(() => {})` with output channel logging for diagnostics.
5. **Webview dedup handles it:** The `applyConfigStatus()` dedup key (`${hasEndpoint}:${hasAuth}:${hasModels}`) naturally handles receiving preliminary status (hasAuth=false) then updated status (hasAuth=true).

## Rationale

- **User experience:** Models dropdown must populate instantly, not after 30+ seconds.
- **Diagnosability:** Logging reveals when/why auth checks hang (useful for troubleshooting).
- **Robustness:** Timeout prevents indefinite hangs from network issues or credential provider bugs.

## Alternatives Considered

- **Parallel auth check:** Start auth check in background but don't await it before sending models. Rejected — still need to coordinate two message sends, and error handling becomes complex.
- **Skip auth check entirely on initial load:** Rejected — we need auth status for the welcome screen.

## Impact

- **Files changed:** `src/extension.ts` (added `withTimeout()` helper, restructured `_sendConfigStatus()`, added outputChannel to constructor)
- **Breaking changes:** None — webview message API unchanged
- **Tests:** All 232 tests pass

## Follow-up

- Consider caching credential provider token (with expiry) to avoid repeated `getToken()` calls during polling.
- Monitor Forge output channel logs for common auth timeout patterns (user feedback requested).
