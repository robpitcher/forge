# Decision: Entra ID Error Classification in authStatusProvider

**Date:** 2026-02-28  
**Author:** Childs (SDK Dev)  
**Requested by:** Rob Pitcher  
**Scope:** `src/auth/authStatusProvider.ts`

## Context

When a user opens the extension without being signed in via Azure CLI, `DefaultAzureCredential.getToken()` throws an error. Previously, **all** such errors were returned as `{ state: "error", message: <raw SDK message> }`, making "not logged in" look like a broken configuration.

## Decision

Classify Entra ID credential errors into two buckets:

1. **Not logged in** — return `{ state: "notAuthenticated", reason: "Sign in with Azure CLI to use Entra ID authentication" }`. Detected by pattern-matching the error message against known DefaultAzureCredential signals:
   - `CredentialUnavailableError`
   - `no credential` / `no default credential`
   - `az login` / `Please run 'az login'`
   - `AADSTS` error codes
   - `interactive` + `authentication`
   - `failed to retrieve` + `token`

2. **Actual errors** (network, misconfiguration) — return `{ state: "error", message: "Entra ID configuration error — check Azure CLI setup" }`. No raw SDK stack traces in the UI.

## Rationale

- Not being logged in is a **normal initial state**, not an error. The UI should show a sign-in prompt, not an error banner.
- The `AuthStatus` type already supports `notAuthenticated` with a `reason` — no type changes needed.
- Friendly error messages prevent exposing internal SDK details to end users.

## Impact

- **Blair (UI):** The webview banner/status bar already handles `notAuthenticated` differently from `error`. This fix ensures first-run users see the correct sign-in prompt.
- **Windows (Tests):** 4 new test cases added, 2 existing tests updated. All 17 authStatusProvider tests pass.
