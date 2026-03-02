# Fuchs — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Learnings

- **Quick Start cleanup (README.md):** Removed redundant step 2 ("Install the Copilot CLI") from Quick Start section — this instruction already lives in Prerequisites right above. Added a one-liner at the top of Quick Start ("Ensure you've installed the [prerequisites](#prerequisites) before starting") to guide users. Renumbered remaining steps to reflect the removal. Goal: Quick Start now focuses on getting Forge running, not dependency installation.
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

---

**📌 Session: README Repositioning**

- ✅ Repositioned README and package.json away from "air-gapped" as headline framing
- New lead: organizational control over inference, private endpoints, no external dependencies
- "Air-gapped" retained as one scenario alongside sovereign cloud and compliance environments
- Rob's preference: straightforward, technical language — no marketing jargon
- package.json `description` field updated to match new positioning

---

**📌 Session: Deployment Name Clarification**

- ✅ Clarified `forge.copilot.models` throughout README: values must match Azure AI Foundry **deployment names**, not underlying model names
- Updated default from `["gpt-4.1", "gpt-4o", "gpt-4o-mini"]` to `[]` (empty array) across Quick Start and Core Settings tables
- Kept example config unchanged — it shows a realistic configured setup
- Model Selector section updated to mention deployment names and the distinction
- Key learning: deployment names and model names can differ in Foundry (e.g., deployment `my-gpt4` may host model `gpt-4o`)

📌 Team update (2026-03-02T15:11:14Z): Models config consolidated — changed `forge.copilot.models` default to empty array. README repositioned to lead with organizational control (private endpoints, data sovereignty, compliance) over "air-gapped" framing. Both decisions merged to decisions.md. — decided by Fuchs & Blair

---

**📌 Session: Icon Addition to README Header**

- ✅ Added Forge icon (`resources/icon.png`) to top of README.md
- Centered layout using `<div align="center">` with 128px × 128px dimensions
- Icon placed before `# Forge` heading for visual appeal
- Approach: Simple HTML markup compatible with GitHub markdown rendering
- No changes to existing content — only prepended the icon element
