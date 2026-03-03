# Decision: Auto-Recovery for Azure CLI "No Subscription" Errors

**Date:** 2026-03-03  
**Decider:** Childs  
**Status:** Implemented

## Context

When users run `az login` but haven't run `az account set`, the `DefaultAzureCredential` → `AzureCliCredential` chain fails with "No subscription found" even though the user IS authenticated. The underlying issue is that `@azure/identity` v4.13.0's `AzureCliCredential` internally calls `az account get-access-token --resource https://cognitiveservices.azure.com`, which requires a subscription context.

Rob Pitcher's requirement: **"With the az cli we shouldn't have to setup an azure subscription. Just authenticating should be sufficient."**

## Decision

Implemented auto-recovery logic in `EntraIdCredentialProvider.getToken()` that:

1. First attempts `DefaultAzureCredential.getToken()` as normal
2. If it fails with "No subscription found" or "az account set" in the error message:
   - Runs `az account list --output json` to fetch available subscriptions
   - Selects the first subscription with `state === "Enabled"`
   - Runs `az account set --subscription <id>` to set the default
   - Logs a console.warn message: `[forge] No Azure subscription set. Auto-selecting: <name> (<id>)`
   - Retries `DefaultAzureCredential.getToken()`
3. If retry succeeds, returns the token
4. If retry fails or no enabled subscriptions exist, throws: `"Azure authentication failed. Run 'az account set --subscription <id>' to select a subscription."`
5. Auto-recovery only attempts ONCE per provider instance (tracked via `hasAttemptedRecovery` boolean)

## Implementation Details

- Import `execSync` from `child_process` for subprocess calls
- Recovery logic wraps the existing `getToken()` logic in try-catch
- Uses defensive JSON parsing of `az account list` output
- Ignores disabled subscriptions (`state !== "Enabled"`)
- Does NOT replace `DefaultAzureCredential` — just adds recovery logic around it
- Keeps existing `DefaultAzureCredential` chain intact (tries Environment → ManagedIdentity → VSCode → AzureCLI → etc)

## Test Coverage

Added 4 new tests to `src/test/auth/credentialProvider.test.ts`:

1. **auto-recovers when 'No subscription found' error occurs** — verifies happy path recovery
2. **auto-recovery only attempts once per provider instance** — ensures no infinite retry loops
3. **auto-recovery fails gracefully when no enabled subscriptions exist** — handles edge case with only disabled subscriptions
4. **does not attempt recovery for non-subscription errors** — ensures we don't trigger recovery for network errors, invalid credentials, etc.

All 17 existing credential tests still pass. Full suite: 236 tests passing.

## Alternatives Considered

1. **Replace DefaultAzureCredential with AzureCliCredential directly** — rejected because it breaks the credential chain (would skip VSCode auth, Managed Identity, etc.)
2. **Pass `tenantId` to AzureCliCredential** — rejected because the problem is missing subscription, not tenant
3. **Document "run az account set first"** — rejected because it creates unnecessary friction for users who are already logged in

## Impact

- Reduces setup friction for Entra ID auth — users only need `az login`, not `az account set`
- Transparent to users when recovery succeeds (just a console.warn in output channel)
- Provides actionable error message if recovery fails
- No breaking changes — existing behavior unchanged when subscription is already set
- Air-gap safe — only calls local `az` CLI commands, no network requests

## Files Changed

- `src/auth/credentialProvider.ts` — added `hasAttemptedRecovery` field, `isNoSubscriptionError()` helper, `autoSelectSubscription()` method, try-catch wrapper in `getToken()`
- `src/test/auth/credentialProvider.test.ts` — added 4 new tests, mocked `child_process.execSync`
