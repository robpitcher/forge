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

📌 Team update (2026-02-27T15:30:00Z): WebviewView migration kickoff. Issues #51 (Windows) and #53 (Blair) launched on parallel branches. Rob confirmed: no Chat Participant API (requires GitHub auth); use WebviewView sidebar instead. Architecture decision merged to decisions.md — Option 1 (WebviewView sidebar) recommended. Backend (copilotService, configuration) unchanged; only extension.ts and webview assets needed. Phase 1 estimate: 2-3 days for minimal viable sidebar + tests. — decided by MacReady, Rob, Scribe orchestration complete

📌 Completed #23 — Session cleanup on conversation end. Added `destroySession()`, `destroyAllSessions()`, and `getSessionCount()` to `copilotService.ts`. PR #46 targeting dev. Key learnings: (1) Session.abort() must be async and handle rejections gracefully — already-ended sessions throw errors. (2) `stopClient()` must call `destroyAllSessions()` before stopping the client to prevent resource leaks. (3) Mock sessions need `abort: vi.fn().mockResolvedValue(undefined)` to avoid test failures. (4) Added safety guard for undefined sessions in cleanup loop — concurrent session removal can create edge cases. Extension deactivation now properly cleans up all active sessions.

📌 Completed #53 — WebviewView sidebar chat UI. Replaced `vscode.chat.createChatParticipant()` with `WebviewViewProvider` in `src/extension.ts`. Created `media/chat.js`, `media/chat.css`, `resources/icon.svg`. Updated `package.json` to remove `chatParticipants` and add `viewsContainers`/`views` contribution points. PR #54 targeting dev. Key learnings: (1) `destroySession()` (not `removeSession()`) is the correct cleanup function after the session cleanup work in #23. (2) `_handleMessage` needs typed parameter `{ command: string; text?: string }` to pass type checking — `any` works but is sloppy. (3) Build/typecheck pass with zero changes to copilotService, configuration, or types — the backend abstraction held. (4) 11 existing tests fail because they mock `vscode.chat.createChatParticipant()` — Windows owns test migration (#51). (5) Media files (chat.js, chat.css) are NOT bundled by esbuild — they're loaded as webview resources at runtime via `webview.asWebviewUri()`.

📌 Team update (2026-02-27T17:00:00Z): MVP batch completion. VSIX packaging & sideload validation (#56) completed in parallel with Windows (#59, #57) and MacReady (#52). Session logs written to .squad/orchestration-log/ and .squad/log/. All PRs targeting dev. — completed by Blair, Scribe orchestration

📌 Chat UI polish batch — 4 UX fixes applied: (1) Body background changed from `--vscode-editor-background` to `--vscode-panel-background`, assistant messages use `--vscode-editor-inactiveSelectionBackground` — gives visual separation from the editor. (2) Moved viewsContainers from `activitybar` to `panel` in package.json so Enclave opens in the bottom panel by default — also fixes inverted resize behavior since panel resizes top-to-bottom. (3) Enter sends message, Shift+Enter inserts newline (was Ctrl/Cmd+Enter to send). (4) Resize inversion resolved by panel placement. Build passes, all 67 tests green. Key learnings: (a) VS Code `viewsContainers.panel` vs `viewsContainers.activitybar` controls default placement and resize direction. (b) `--vscode-panel-background` is the correct theme token for panel-hosted webviews. (c) Media files (chat.js, chat.css) are runtime-loaded, not bundled — changes take effect without rebuild.
