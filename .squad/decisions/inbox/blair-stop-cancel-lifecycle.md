# Decision: Stop/Cancel Lifecycle Pattern

**Author:** Blair (Extension Dev)
**Date:** 2025-07-24
**Context:** PR #155 review — stop button edge cases

## Decision

For async operations with a multi-phase lifecycle (thinking → generating → idle), use a **request-scoped cancellation flag + request ID counter** pattern:

1. **Cancellation flag** (`_cancelRequested`): Set by the stop handler, checked at each phase boundary before expensive work begins. Reset at the start of each new request.

2. **Request ID** (`_requestId`): Incremented per request. `finally` blocks only clean up if their captured ID matches the current one, preventing stale cleanup from clobbering newer requests.

3. **Always `await` SDK abort calls** in try/catch — fire-and-forget `.catch(() => {})` can mask errors that later surface as confusing messages.

4. **Webview safety timeouts**: When the webview sends a command that should trigger a phase update, set a ~3s fallback timer to reset UI state if the extension doesn't respond. Clear the timer when the real update arrives.

## Rationale

The original stop handler only worked during the `generating` phase (when `_currentSession` exists). During `thinking`, the session hasn't been created yet, so `session.abort()` is impossible. The cancellation flag bridges this gap. The request ID prevents race conditions when stop is quickly followed by a new send.
