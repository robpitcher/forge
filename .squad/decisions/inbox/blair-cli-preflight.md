# CLI Preflight Validation

**Date:** 2025-03-03  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Decision

Added preflight CLI validation during extension activation that checks if the GitHub Copilot CLI is correctly installed and accessible.

## Context

Per Rob's directive, the extension no longer bundles the @github/copilot CLI. Instead, it requires the user to install it globally and configure it via `forge.copilot.cliPath` setting. We needed a way to validate CLI availability at startup and provide actionable fix-it UX.

## Implementation

1. **Extension Activation (`src/extension.ts`)**
   - Added `performCliPreflight()` function that calls `discoverAndValidateCli()` from copilotService
   - Runs async during activation (fire-and-forget, doesn't block)
   - Re-runs when `forge.copilot.cliPath` config changes

2. **Fix-it UX**
   - Shows VS Code warning message with buttons based on failure reason:
     - `not_found`: "Open Settings" or "Open Terminal" (to run npm install)
     - `wrong_binary`: "Open Settings"
     - `version_check_failed`: "Open Settings" with details
   - Simultaneously posts `cliStatus` message to webview for in-chat banner

3. **Webview Banner (`media/chat.js`)**
   - Added `updateCliBanner()` function similar to `updateAuthBanner()`
   - Shows ✅ "CLI ready" on success (auto-dismisses in 2s)
   - Shows ⚠️ error message with "Fix" button on failure
   - Styled using existing `.auth-banner` CSS classes

4. **Test Updates**
   - Added mock for `discoverAndValidateCli()` in test files
   - Added `cliStatus` to message type filters (similar to `authStatus`, `modelsUpdated`, etc.)

## Rationale

- **Proactive validation** catches CLI issues before the user tries to chat
- **Actionable messages** tell users exactly what to do (install, configure, etc.)
- **Consistent UX** uses existing banner pattern from auth status
- **Non-blocking** doesn't slow down activation
- **Testable** properly mocked in tests

## Verification

- ✅ `npx tsc --noEmit` — passes
- ✅ `npm test` — all 246 tests pass
- ⚠️ `npm run build` — pre-existing highlight.js bundling issue on branch (not related to CLI preflight changes)

## Notes

The build error with highlight.js is from commit 3cc82b6 on the current branch and is unrelated to CLI preflight validation. The CLI preflight code is ready and tested.

---

**Dependencies:** Relies on `discoverAndValidateCli()` and `CopilotCliValidationResult` type added by Childs in parallel.
