# Decision: Comprehensive Coding Standards in copilot-instructions.md

**Author:** MacReady (Lead)
**Date:** 2026-02-28
**Status:** Accepted

## Context

The `@copilot` coding agent uses `.github/copilot-instructions.md` as its primary reference when writing and reviewing code. The file only had branching strategy and squad integration sections — no coding standards, SDK patterns, or project conventions.

## Decision

Expanded `.github/copilot-instructions.md` with 8 sections covering project overview, architecture, SDK conventions, TypeScript style, testing patterns, VS Code extension conventions, error handling, and security.

## Key Conventions Codified

1. **BYOK provider config** uses `type: "openai"`, not `type: "azure"`, for Azure AI Foundry endpoints with `/openai/v1/` path
2. **Event handling** uses `.on(eventName, handler)` named pattern (not catch-all `.on(callback)`)
3. **Send API** is `session.send({ prompt })`, not `session.sendMessage()`
4. **bearerToken** is static string only — no refresh callback (tracked in #27)
5. **Mock patterns** for tests: `DefaultAzureCredential` as class, `SecretStorage` as object with `get`/`store`/`delete`/`onDidChange`
6. **"Never throws" functions** must catch ALL async operations including SecretStorage
7. **API keys** only via SecretStorage, never settings.json
8. **Air-gap compliance** — no external network calls except configured Azure AI Foundry endpoint

## Impact

- All `@copilot` PRs should now align with project conventions without squad members having to correct patterns
- SDK integration patterns are documented in one place instead of scattered across skill files
- Reduces review burden on MacReady and Childs for SDK-related changes
