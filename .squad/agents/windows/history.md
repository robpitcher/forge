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
