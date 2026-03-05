# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Core Context

**Recent work:** Workspace awareness feature testing (9 tests added, all passing). Prior work includes integration testing suite, code review validation, test coverage analysis. Focus: ensuring SDK integration stability and comprehensive test coverage.

**Key patterns:** Dynamic imports converted to static, mock SMS arguments match real SDK interface, test isolation via stopClient() works reliably.

**Next phase:** Merge workspace awareness tests to dev. Monitor for test suite gaps in new features.

**Full history:** See .squad/decisions.md and prior orchestration logs.

---

📌 Team update (2026-03-05): Workspace Awareness testing complete — added 9 tests covering all scenarios (webview indicator, session recreation, no-folder case, resume). All 300 tests green. Feature ready for merge to dev.

