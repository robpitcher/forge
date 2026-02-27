# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/extension.ts` — Activation, chat participant registration, request handler
- `src/configuration.ts` — VS Code settings reader and validator
- `package.json` — Extension manifest, chat participant contribution, settings schema
- `esbuild.config.mjs` — Bundle configuration
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Product requirements

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-27T04:19:00Z): 28 GitHub issues (#2–#29) created and linked to project board #8 (Enclave). PRD fully decomposed with dependencies, priorities, milestones, and squad routing. Ready for pickup. — decided by MacReady & Childs. Project: https://github.com/robpitcher/enclave/projects/8

📌 Team update (2026-02-27T05:03:36Z): MVP triage complete. 8 issues routed to @copilot (scaffolding, build, packaging, docs, lint); core implementation remains with squad members. Core issues #3–5, #7–14 assigned to Blair for parallel pickup. E2E testing issues #9–10, #13 blocked on #2. — decided by MacReady

📌 Team update (2026-02-27T14:39:00Z): Round 3 complete. Windows delivered air-gap validation tests (18 tests, #47); MacReady delivered installation and configuration docs (#45); Blair delivered session cleanup implementation (PR #46). All 59 tests passing. All PRs targeting dev. Decisions merged to `.squad/decisions.md`. Orchestration logs written. — Scribe

📌 Completed #12 — Multi-turn conversation context tests (SC4). Created `src/test/multi-turn.test.ts` with 15 tests covering: session reuse, session isolation, multi-message persistence, cleanup, conversation ID fallback generation, and concurrent session management. PR #44 targeting dev. Key learnings: (1) Mock `createSession` returns same object by default — need per-call mock sessions when testing object identity across conversations. (2) `require("vscode")` doesn't work with vitest ESM alias — must use top-level `import * as vscode` instead. (3) `getOrCreateClient` has a race condition with `Promise.all` — create sessions sequentially in tests. (4) `getConversationId` is private, tested indirectly via captured handler from `activate()`.

📌 Completed #23 — Session cleanup on conversation end. Added `destroySession()`, `destroyAllSessions()`, and `getSessionCount()` to `copilotService.ts`. PR #46 targeting dev. Key learnings: (1) Session.abort() must be async and handle rejections gracefully — already-ended sessions throw errors. (2) `stopClient()` must call `destroyAllSessions()` before stopping the client to prevent resource leaks. (3) Mock sessions need `abort: vi.fn().mockResolvedValue(undefined)` to avoid test failures. (4) Added safety guard for undefined sessions in cleanup loop — concurrent session removal can create edge cases. Extension deactivation now properly cleans up all active sessions.
