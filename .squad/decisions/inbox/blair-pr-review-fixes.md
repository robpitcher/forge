# Decision: Multi-subscription guardrail and execFileSync for Azure CLI calls

**Author:** Blair (Extension Dev)
**Date:** 2025-07-15
**Status:** Implemented

## Context

PR review identified that `autoSelectSubscription()` in credentialProvider.ts had three issues:
1. It blindly picked the first enabled subscription on multi-subscription machines, mutating global Azure CLI state.
2. It used `execSync` with shell string interpolation, opening a (low-risk) command injection vector.
3. No timeout on `execSync` calls — a hung `az` CLI could block the extension host indefinitely.

## Decision

- **Only auto-select when exactly one** enabled subscription exists. Zero or multiple → return false with actionable error guidance.
- **Use `execFileSync`** with argument arrays instead of `execSync` with shell strings for all `az` CLI calls.
- **Add 10-second timeout** to all `execFileSync` calls.

## Impact

- `src/auth/credentialProvider.ts` — `autoSelectSubscription()` return type changed from `void` to `boolean`
- Test mocks updated from `execSync` → `execFileSync`
- Any future `child_process` usage in auth code should follow the same pattern: `execFileSync` + args array + timeout
