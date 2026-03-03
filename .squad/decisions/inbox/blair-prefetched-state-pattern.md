### Prefetched state pattern for auth polling

**By:** Blair
**Date:** 2026-03-02
**What:** Functions that are called in sequence and need the same async data (config + auth status) should pass results down via optional params rather than re-fetching. `_sendConfigStatus(prefetched?: PrefetchedState)` and `refreshWebviewState(prefetched?)` now accept pre-computed data. `updateAuthStatus()` returns `AuthStatus` so callers can reuse it.
**Why:** The 30s auth poll was making 2× `getToken()` calls — once in `updateAuthStatus()` and again in `_sendConfigStatus()`. For Entra ID, each `getToken()` may hit Azure Identity. This halves the auth overhead.
