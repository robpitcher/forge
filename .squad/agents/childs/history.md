# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/copilotService.ts` — CopilotClient lifecycle, BYOK session creation, session map
- `src/extension.ts` — Where SDK events (message_delta, session.idle, session.error) are consumed
- `package.json` — @github/copilot-sdk dependency (v0.1.26)
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Product requirements

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-27T05:03:36Z): MVP triage complete. Documentation issues #17–19 routed to @copilot for initial draft (docs/setup guide); Childs owns #21, #23–24 (deferred features, air-gap guide, config details). Dependency: #19 must complete before #17 final review. — decided by MacReady
