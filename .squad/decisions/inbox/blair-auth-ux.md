# Auth UX Improvements

**Date:** 2026-03-01  
**Decided by:** Blair  
**Context:** User feedback — auth banner flashing every 30s was distracting; status bar tooltip didn't show signed-in account

## Decisions

### 1. Deduplicate authStatus messages to webview

**Problem:** `updateAuthStatus()` is called every 30s by the auth polling interval. Each call triggers `postAuthStatus()` which posts to the webview, causing the green "✅ Authenticated via Entra ID" banner to flash every 30 seconds even when nothing has changed.

**Solution:** Track the last auth status sent to the webview (`_lastAuthStatus` field on `ChatViewProvider`) and compare before posting. Use `JSON.stringify()` on the full status object + hasEndpoint flag for comparison. Reset `_lastAuthStatus` to `undefined` in `resolveWebviewView()` so the initial status message always goes through when the webview loads.

**Rationale:** Status bar updates should continue happening every 30s (they don't cause disruption), but the webview banner should only appear when the auth state actually changes. This preserves reactive UI behavior while eliminating the distracting flash.

### 2. Show signed-in account in status bar tooltip

**Problem:** Status bar tooltip showed "Authenticated via Entra ID" without identifying which Azure account was signed in. Users wanted to confirm they're using the correct account.

**Solution:** 
- Added optional `account?: string` field to `AuthStatus` authenticated state
- In `checkAuthStatus()` for Entra ID mode, decode the JWT token payload and extract the user identity from `upn`, `preferred_username`, or `name` claims (in that order)
- Updated status bar tooltip logic to show "Signed in as {account} (Entra ID)" when account is available
- For API Key mode, tooltip remains "Authenticated via API Key" (no user identity available)

**JWT decode implementation:** Simple base64url decode using `Buffer.from(parts[1], "base64url")` — no signature verification needed since we're only using this for display, not authentication.

**Rationale:** Helps users confirm they're authenticated with the correct Azure identity, especially in environments where multiple Azure accounts might be configured.

## Impact

- **Extension UX:** Less distracting auth polling, more informative status bar
- **No breaking changes:** Auth logic unchanged, only display improvements
- **Tests:** All 134 tests pass with no modifications needed
