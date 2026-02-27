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
