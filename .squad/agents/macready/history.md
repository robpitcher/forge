# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/extension.ts` — Activation, chat participant registration, request handler
- `src/copilotService.ts` — CopilotClient lifecycle, BYOK session creation
- `src/configuration.ts` — VS Code settings reader and validator
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Product requirements (source of truth)
- `package.json` — Extension manifest, chat participant contribution, settings schema

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-27: PRD Decomposition & Code Review

**Architecture:**
- Extension uses VS Code Chat Participant API (`vscode.chat.createChatParticipant`) for native chat panel integration
- CopilotClient from `@github/copilot-sdk` manages JSON-RPC communication with local Copilot CLI process over stdio
- BYOK mode configured at session creation: `provider.type: "openai"`, `provider.baseUrl` (Azure AI Foundry), `provider.apiKey`
- Session lifecycle: lazy-create client on first chat, reuse sessions per conversation ID (derived from `ChatContext.id` or generated fallback)
- Event-driven streaming: `assistant.message_delta` events → `ChatResponseStream.markdown()`

**Key Patterns:**
- Lazy client initialization (`getOrCreateClient`) to avoid startup overhead
- Session Map keyed by conversation ID for multi-turn context reuse
- Defensive error handling: custom `CopilotCliNotFoundError` class, config validation before session creation, display errors in chat stream with settings button
- VS Code cancellation token wired to `session.abort()` for user-initiated stops

**Implementation Status:**
- Core functionality (FR1-FR6): ✅ Complete
- Error handling (FR7): ✅ Complete
- Packaging scripts (FR8): ✅ Defined, not yet validated
- Testing: ❌ No test suite; manual testing required for SC1-SC7

**Risks:**
- SDK type safety: `copilotService.ts` uses `any` types due to Technical Preview SDK (no exported TypeScript interfaces)
- Event listener cleanup logic has defensive fallback (`session.off` vs `session.removeListener`) suggesting API uncertainty
- Conversation ID derivation assumes `ChatContext.id` exists (not guaranteed by VS Code API docs)
- API key stored as plain string in settings (not using VS Code SecretStorage)

**File Ownership:**
- `src/extension.ts`: Activation, chat participant registration, request handler, streaming response logic
- `src/copilotService.ts`: CopilotClient lifecycle, BYOK session creation with Azure AI Foundry config
- `src/configuration.ts`: VS Code settings reader, validation logic for required fields (endpoint, apiKey)
- `package.json`: Extension manifest, chat participant contribution, settings schema (5 settings: endpoint, apiKey, model, wireApi, cliPath)
