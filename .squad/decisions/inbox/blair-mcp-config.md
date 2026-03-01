# Decision: McpServerConfig is a simplified local-only shape

**By:** Blair (Extension Dev)
**Date:** 2025-07-18
**Issue:** #90

## Context

The Copilot SDK provides `MCPLocalServerConfig` with fields like `type`, `tools`, `timeout`, `cwd`. We needed to decide whether to re-export the SDK type directly or define our own.

## Decision

Define a minimal `McpServerConfig` in `src/types.ts` with only `command`, `args?`, and `env?`. Childs maps this to the SDK's `MCPLocalServerConfig` in `copilotService.ts`.

## Rationale

- Keeps the extension settings schema simple for users — they only configure what matters for air-gapped stdio servers.
- Decouples extension config from SDK internals — if the SDK shape changes, only the mapping layer in copilotService needs updating.
- The `type` field is always "local" (air-gap constraint), so no need to expose it.
- Additional SDK fields (`tools`, `timeout`, `cwd`) can be added later if needed without breaking existing configs.
