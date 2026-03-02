# Fuchs — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Learnings

- **PR #116 review fixes (README.md):** Addressed 5 review comments — renamed "Copilot Language Server" to "Copilot CLI" throughout (architecture diagram, prerequisites, quick start, settings table), and marked the Chat Modes section as a planned feature since no `ChatMode` type or mode selector UI exists in the codebase. The binary is `copilot` v0.0.418+ from `github/copilot-cli`.
- **Terminology:** The local process spawned by the SDK is called "Copilot CLI", not "Copilot Language Server". Use "Copilot CLI" consistently in all docs.
- **Chat Modes are planned, not shipped:** No mode selector exists in `media/chat.js` and no `ChatMode` type exists in `src/copilotService.ts`. The extension currently defaults to Agent mode.
- **README documentation updates:** Replaced developer-focused Installation section (clone/build workflow) with user-focused two-path install guide (GitHub Releases for air-gapped envs, VS Code Marketplace). Added devcontainer note at top of Development section highlighting pre-configured setup for Codespaces/Dev Containers. Removed redundant "Building from Source" section. Architecture section untouched per Nauls ownership.
- **Installation guide consolidation (decision: remove docs/installation-guide.md):** Removed out-of-scope Copilot CLI installation instructions from docs. Users now refer directly to the upstream [Copilot CLI repo](https://github.com/github/copilot-cli). Added Azure CLI (`az`) as a required prerequisite in README (with note it's for Entra ID auth). Updated all references in configuration-reference.md to point to Copilot CLI repo. This aligns with air-gapped deployment philosophy: minimize duplicated upstream docs, always link to canonical sources.

---

**📌 Session: 2026-03-02T15:01:28Z**

- ✅ Decision merged: "Remove Copilot CLI Installation Guide from Docs" 
- All references updated to link upstream; Copilot CLI now canonical source
- Azure CLI added as prerequisite (Entra ID auth support)
