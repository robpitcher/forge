# Decision: Use cached auth state for preliminary configStatus messages

**Date:** 2026-03-07
**Author:** Blair (Extension Dev)
**Context:** Webview flicker bug — setup screen briefly appearing on fully configured extensions

## Decision

The preliminary `configStatus` message sent by `_sendConfigStatus()` now uses a cached `_lastKnownHasAuth` field instead of hardcoding `hasAuth: false`. Priority order: prefetched auth status (from `updateAuthStatus`) > cached last known auth > `false` (first load only).

## Rationale

`_sendConfigStatus()` sends a synchronous preliminary message before the async auth check completes. Previously this always had `hasAuth: false`, which caused `applyConfigStatus()` in the webview to momentarily show the welcome/setup screen — even when the extension was fully configured and authenticated. This flicker occurred on every 30-second auth poll, config change, window focus, and panel reopen.

The fix caches the auth result after each async check and reuses it for subsequent preliminary messages. This is safe because:
- Auth state changes infrequently (only on credential rotation or config change)
- The final `configStatus` still arrives after the real async check, correcting any stale cache
- On first load, `_lastKnownHasAuth` defaults to `false`, preserving the "unconfigured" first-run experience

## Pattern

**When sending optimistic/preliminary messages before async work, cache the last known state rather than using a pessimistic default.** This prevents UI flicker for repeat calls while preserving correct first-run behavior.

## Scope

- `src/extension.ts` — `_lastKnownHasAuth` field on `ChatViewProvider`, used in `_sendConfigStatus()`
