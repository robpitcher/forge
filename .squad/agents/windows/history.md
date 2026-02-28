# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/extension.ts` — Request handler with error paths to test
- `src/copilotService.ts` — SDK client lifecycle with error handling to test
- `src/configuration.ts` — Configuration validation to test
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Success criteria SC1-SC7
- `package.json` — Test scripts

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-27T04:19:00Z): 28 GitHub issues (#2–#29) created and linked to project board #8 (Enclave). PRD fully decomposed with dependencies, priorities, milestones, and squad routing. Ready for pickup. — decided by MacReady & Childs. Project: https://github.com/robpitcher/enclave/projects/8

📌 Team update (2026-02-27T05:03:36Z): MVP triage complete. Build & packaging issues #15–16 routed to @copilot for validation scripts; test management remains with Windows. All testing issues (#9–10, #13) blocked on #2 completion. — decided by MacReady

✅ Build pipeline validation (2026-02-27T05:48:00Z): Issue #2 validated and closed. `npm install`, `npm run build`, and `npm run package` all succeed. Project structure matches PRD Section 8. esbuild produces valid 184KB bundle with @github/copilot-sdk correctly bundled. `.vsix` packaging works but produces 95MB file due to missing `.vscodeignore` (includes node_modules, .squad, specs). Core build pipeline is sound—bloat is a packaging config issue. Expected final size ~500KB once `.vscodeignore` is added. — validated by Windows

✅ Error scenario tests (SC5) completed: Issue #13 — added 10 tests in `src/test/error-scenarios.test.ts` covering all 7 error paths: missing config validation, CopilotCliNotFoundError (ENOENT/not found/cannot find), session.error event, general startup error, sendMessage rejection, config validation display with settings button, and session removal on error. All 26 tests pass (10 new + 16 existing). PR #43 opened targeting dev. Note: `multi-turn.test.ts` has 6 pre-existing failures unrelated to this work. — validated by Windows

✅ WebviewView test infrastructure rewrite (Issue #51): Rewrote all 3 test files (extension.test.ts, multi-turn.test.ts, error-scenarios.test.ts) for WebviewView message protocol. Created shared test helpers in `src/test/webview-test-helpers.ts`. Updated vscode mock with `window.registerWebviewViewProvider` and `Uri` class. 50 total tests: 30 pass on this branch (copilotService + configuration + direct session tests), 20 expected failures (extension.ts not yet rewritten). All 50 pass on `squad/53-webview-sidebar` where Blair's WebviewView implementation lives. PR #55 opened targeting dev. Depends on #53 merge first. Key protocol tested: streamStart→streamDelta→streamEnd, error posting, conversationReset, sendMessage/newConversation commands. — validated by Windows

📌 Team update (2026-02-27T15:30:00Z): WebviewView migration kickoff. Issues #51 (Windows) and #53 (Blair) launched on parallel branches. Rob confirmed: no Chat Participant API (requires GitHub auth); use WebviewView sidebar instead. Architecture decision merged to decisions.md — Option 1 (WebviewView sidebar) recommended. Backend (copilotService, configuration) unchanged; only extension.ts and webview assets needed. Phase 1 estimate: 2-3 days for minimal viable sidebar + tests. — orchestrated by Scribe, team ready for parallel work on test scaffolding and implementation

📌 Team update (2026-02-27T14:39:00Z): Round 3 complete. Windows delivered air-gap validation tests (18 tests, #47); MacReady delivered installation and configuration docs (#45); Blair delivered session cleanup implementation (PR #46). All 59 tests passing. All PRs targeting dev. Decisions merged to `.squad/decisions.md`. Orchestration logs written. — Scribe

🔧 Rebase conflict resolution (2026-02-27T18:33:00Z): PR #57 (`squad/14-streaming-tests` → dev) had merge conflicts after PRs #56, #58, #59 merged into dev. Rebased onto origin/dev. Single conflict in README.md resolved by keeping dev's version (docs updates from #58). Discovered that the original `fix: address PR #56 review comments` commit had accidentally emptied `air-gap-validation.test.ts` (327 lines → 0). Restored from origin/dev and added a fix commit. All 67 tests pass across 6 suites. Force-pushed, PR now `mergeable_state: clean`. **Lesson:** When branches carry unstaged/stashed files from other work streams, rebase conflicts can silently wipe file contents — always verify file sizes post-rebase. — validated by Windows

✅ Air-gap validation tests (Issue #11): Created `src/test/air-gap-validation.test.ts` with 17 tests validating SC2 (BYOK mode) and SC3 (no GitHub auth). Tests confirm: (1) CopilotClient and sessions work without GITHUB_TOKEN env var, (2) provider config uses only user-configured Azure endpoint (never github.com), (3) provider type set to `azure` with `apiVersion: 2024-10-21` for Azure endpoints, (4) session config contains zero GitHub references, (5) supports both Azure and generic OpenAI-compatible endpoints. All 67 tests pass. PR #59 opened targeting dev. Key learning: Use unique conversation IDs per test to avoid session caching issues across test runs. — validated by Windows

📌 Team update (2026-02-27T17:00:00Z): MVP batch completion. Air-gap validation (17 tests, #59) and streaming smoothness (16 tests, #57) completed in parallel with MacReady (#52 docs) and Blair (#56 packaging). 33 tests written total. All PRs targeting dev. Session logs written to .squad/orchestration-log/ and .squad/log/. — completed by Windows, Scribe orchestration

✅ Tool approval flow tests (Issue #25): Created `src/test/tool-approval.test.ts` with 13 tests (4 passing now, 9 `.todo()` awaiting implementation). Passing tests: session config shape validation, text-only chat regression, autoApproveTools defaults to false, autoApproveTools reads from config. Todo tests cover: permission request → webview toolConfirmation, auto-approve bypass, SDK confirmation/rejection on user response, toolResult rendering (success/error), unknown toolCallId handling, concurrent tool call tracking, and availableTools removal. All 80 tests across 7 suites pass (71 active + 9 todo). SDK tool event types confirmed: `tool.execution_complete` has `success`, `result`, `error` fields; `PermissionRequest` has `kind`, `toolCallId`; `PermissionRequestResult` uses `approved`/`denied-interactively-by-user`. Key pattern: `onPermissionRequest` callback in `SessionConfig` is the SDK hook for tool approval. — validated by Windows

📌 Team update (2026-02-28T0000Z): Tool approval flow uses callback + events pattern. Test framework ready; 4/13 tests active. Priority: implement remaining 9 tests for shell, write, read, mcp, url permissions. — decided by Childs & Windows

✅ Context attachment tests (Issue #26): Created `src/test/context-attachment.test.ts` with 7 tests (3 active, 4 `.todo()`). Active tests: (1) plain text message sends only prompt text — no context prefix (regression), (2) empty context array treated as no context, (3) streaming works correctly for plain messages. Todo tests awaiting Blair/Childs implementation: context included in prompt, multiple context items, context truncation >8000 chars, command registration (forge.attachSelection/forge.attachFile). Confirmed `_buildPromptWithContext` does NOT exist yet — all context-dependent tests are `.todo()` with detailed assertion comments for when the feature lands. All 87 tests pass (78 active + 9 todo) across 8 suites. — validated by Windows
