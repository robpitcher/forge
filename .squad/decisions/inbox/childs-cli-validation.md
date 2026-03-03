# CLI Validation Functions

**Date:** 2026-03-03  
**Author:** Childs (SDK Dev)  
**Context:** Issue — CLI validation requirement after reverting bundled CLI  
**Status:** Implemented

## Decision

Added two exported functions to `src/copilotService.ts` for validating that a discovered or configured CLI binary is actually the `@github/copilot` CLI:

1. **`validateCopilotCli(cliPath: string): Promise<CopilotCliValidationResult>`**
   - Runs `<cliPath> --version` with 5-second timeout
   - Returns `{ valid: true, version, path }` if version output received
   - Returns `{ valid: false, reason: "not_found" | "wrong_binary" | "version_check_failed", ... }` on error
   - Validation logic: The @github/copilot CLI supports `--version` and returns version output without error. Other `copilot` binaries (e.g., HashiCorp Terraform Copilot, Microsoft 365 Copilot CLI) may not support this flag or may fail.

2. **`discoverAndValidateCli(configuredPath?: string): Promise<CopilotCliValidationResult>`**
   - If `configuredPath` is non-empty, validates it directly
   - Otherwise, calls `resolveCopilotCliFromPath()` to discover from PATH
   - Returns validation result or `{ valid: false, reason: "not_found" }` if no binary found

## Type Definition

```typescript
export type CopilotCliValidationResult =
  | { valid: true; version: string; path: string }
  | { valid: false; reason: "not_found" | "wrong_binary" | "version_check_failed"; path?: string; details?: string };
```

## Rationale

- **Separation of concerns:** Validation is a separate function that the extension layer (Blair's domain) will call at activation time. `getOrCreateClient()` remains unchanged.
- **Async design:** Returns `Promise` for consistency with SDK patterns, even though `execSync` is used internally (wrapped in Promise for future flexibility).
- **Error classification:** Three failure reasons allow UI layer to show specific messages: install CLI vs. configure correct path vs. network/permission issues.
- **Air-gap safe:** Only runs `--version` command locally, no network calls.

## Testing

Added 11 tests to `src/test/copilotService.test.ts`:
- `validateCopilotCli`: 5 tests (valid CLI, wrong binary, not found, empty output, timeout)
- `discoverAndValidateCli`: 6 tests (configured path, discover from PATH, not found, wrong binary discovered, empty config)

All tests pass. TypeScript compilation clean.

## Future Work

Extension layer (Blair) will call `discoverAndValidateCli()` at activation and show fix-it UX when validation fails.
