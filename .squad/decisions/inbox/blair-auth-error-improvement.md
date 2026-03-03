# Decision: Extract Actionable Entra ID Error Messages

**Date:** 2025-03-03  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Context

When using Entra ID authentication (the default), users were seeing verbose, confusing error messages that dumped the entire `ChainedTokenCredential` error chain. This included failures from all credential providers (EnvironmentCredential, ManagedIdentityCredential, VS Code auth, Azure CLI, PowerShell), even though most were irrelevant to the user's situation.

Example of old error:
```
Entra ID authentication failed. Ensure you're signed in via Azure CLI... Details: ChainedTokenCredential authentication failed.
CredentialUnavailableError: EnvironmentCredential is unavailable...
CredentialUnavailableError: ManagedIdentityCredential: Authentication failed...
CredentialUnavailableError: Visual Studio Code Authentication is not available...
CredentialUnavailableError: ERROR: No subscription found. Run 'az account set' to select a subscription.
[... many more lines ...]
```

Users reported this as a "false positive" since the error appeared during initial auth check but auth succeeded after running `az account set`.

## Decision

Added a helper method `_extractEntraIdErrorSummary(rawMessage: string): string` in `src/extension.ts` that:

1. Parses the raw `ChainedTokenCredential` error to extract the most actionable failure
2. Pattern-matches common Azure CLI issues:
   - No subscription found → "Run 'az account set'"
   - Not logged in → "Run 'az login'"
   - AADSTS errors → "Run 'az login' and 'az account set'"
   - MFA/interactive required → "Run 'az login'"
   - Generic fallback → "Check your Azure CLI setup"
3. Returns a SHORT (1-2 lines), actionable message instead of the full chain dump

Updated two locations in `extension.ts`:
- Line 676-682 (`_handleChatMessage`)
- Line 990-995 (`resumeConversation` handler)

Both now call `_extractEntraIdErrorSummary()` and present concise, actionable errors like:
```
Entra ID authentication failed. Azure CLI: No subscription found. Run 'az account set' to select a subscription, then try again. Or switch to API key auth in Settings (forge.copilot.authMethod).
```

## Rationale

- **User experience:** Actionable, concise errors reduce confusion and help users fix auth issues quickly
- **Signal-to-noise:** Most credential chain failures are irrelevant (e.g., ManagedIdentity on local dev)
- **Azure CLI focus:** Forge users in air-gapped environments primarily use Azure CLI for Entra ID auth
- **Follows charter:** "Keep error messages actionable — tell the user what to do, not just what went wrong"

## Alternatives Considered

1. **Show only the last error in the chain** — rejected because the last error isn't always the most actionable
2. **Attempt to parse structured error objects** — rejected as `@azure/identity` errors are strings, not structured
3. **Hide errors entirely until second failure** — rejected as users need immediate feedback

## Impact

- **Files changed:** `src/extension.ts`
- **Tests:** All tests pass (232 passed, 3 skipped)
- **TypeScript:** Type-checks clean
- **Breaking changes:** None (internal implementation detail)
