# Decision: SDK Upgrade Path @github/copilot-sdk 0.1.26 → 0.1.32

**Date:** 2026-03-04  
**Author:** Childs (SDK Dev)  
**Context:** User's GitHub CLI jumped from `^0.0.414` to `^1.0.2` (protocol v3). SDK v0.1.26 is on protocol v2. Extension crashes on startup with "SDK protocol version mismatch: SDK expects version 2, but server reports version 3."

## Decision

Upgrade `@github/copilot-sdk` to `0.1.32`. This is the only SDK version that supports protocol v3 (matching CLI v1.0.2).

## Required Code Changes Before Upgrade

1. **`src/copilotService.ts`** — `onPermissionRequest` in `SessionConfig` is now a required field. `buildSessionConfig()`, `getOrCreateSession()`, and `resumeConversation()` must be updated to require `onPermissionRequest: PermissionHandler` (remove `?`), always including it in the session config object. The `approveAll` helper from the SDK is a safe fallback default.

2. No other breaking changes affect Forge's codebase. `session.destroy()` is deprecated but still functional; `session.disconnect()` is preferred going forward.

## Rationale

- Protocol mismatch is a hard failure — extension is entirely non-functional until fixed.
- The `onPermissionRequest` required field change will cause TypeScript compile errors that block `npm run build` — must be fixed in the same PR as the SDK bump.
- All other changes (new `setModel()`, new `disconnect()`, new permission result variant) are additive/behavioral and safe to adopt incrementally.

## Risk

Low. Our BYOK provider configuration (`ProviderConfig`), event handling pattern (named events with unsubscribe), client lifecycle (`start()`/`stop()`), and CLI binary resolution are all unchanged.
