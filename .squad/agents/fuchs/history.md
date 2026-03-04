# Fuchs — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Learnings

- **Stale Documentation Refresh (2026-03-14):** Updated README.md and docs/sideload-test-checklist.md to reflect current release process. (1) Changed README.md VS Code Marketplace section from "planned for future release" to describe current insider/pre-release publishing via the .github/workflows/insider-release.yml workflow. (2) Made version references version-agnostic: replaced hardcoded `forge-0.1.0.vsix` with `forge-<version>.vsix` in README packaging section and with `forge-*.vsix` in shell commands. (3) Updated sideload-test-checklist.md version references: file verification step now uses pattern matching, installation step uses example `forge-0.2.0.vsix`, and version verification uses placeholder `0.2.0`. All edits maintained backward compatibility while removing outdated version pins. Key learning: Use glob patterns and examples rather than version pinning in user-facing docs to reduce maintenance burden across releases.
- **Initial CHANGELOG.md (2025-03-13):** Created `CHANGELOG.md` at repo root following Keep a Changelog format with `[Unreleased]` section and comprehensive `[0.2.0]` release notes. Documented all major features (BYOK Azure AI Foundry integration, dual auth, multi-model support, code attachments, editor commands, conversation history, air-gap compliance, auto CLI installation, tool support, webview chat). Marked as pre-release/alpha per Marketplace requirements. Included full configuration table and version link section. Goal: Provide clear release history for VS Code Marketplace extension page.
- **Quick Start cleanup (README.md):** Removed redundant step 2 ("Install the Copilot CLI") from Quick Start section — this instruction already lives in Prerequisites right above. Added a one-liner at the top of Quick Start ("Ensure you've installed the [prerequisites](#prerequisites) before starting") to guide users. Renumbered remaining steps to reflect the removal. Goal: Quick Start now focuses on getting Forge running, not dependency installation.
- **PR #116 review fixes (README.md):** Addressed 5 review comments — renamed "Copilot Language Server" to "Copilot CLI" throughout (architecture diagram, prerequisites, quick start, settings table), and marked the Chat Modes section as a planned feature since no `ChatMode` type or mode selector UI exists in the codebase. The binary is `copilot` v0.0.418+ from `github/copilot-cli`.
- **Terminology:** The local process spawned by the SDK is called "Copilot CLI", not "Copilot Language Server". Use "Copilot CLI" consistently in all docs.
- **Chat Modes are planned, not shipped:** No mode selector exists in `media/chat.js` and no `ChatMode` type exists in `src/copilotService.ts`. The extension currently defaults to Agent mode.
- **README documentation updates:** Replaced developer-focused Installation section (clone/build workflow) with user-focused two-path install guide (GitHub Releases for air-gapped envs, VS Code Marketplace). Added devcontainer note at top of Development section highlighting pre-configured setup for Codespaces/Dev Containers. Removed redundant "Building from Source" section. Architecture section untouched per Nauls ownership.
- **Installation guide consolidation (decision: remove docs/installation-guide.md):** Removed out-of-scope Copilot CLI installation instructions from docs. Users now refer directly to the upstream [Copilot CLI repo](https://github.com/github/copilot-cli). Added Azure CLI (`az`) as a required prerequisite in README (with note it's for Entra ID auth). Updated all references in configuration-reference.md to point to Copilot CLI repo. This aligns with air-gapped deployment philosophy: minimize duplicated upstream docs, always link to canonical sources.
- **API version parameter fix (2026-03-13):** Added `api-version=2024-10-21` query parameter to all four curl examples in configuration-reference.md (lines 266, 501, 529, 535) and updated all endpoint examples from `.openai.azure.com` to `.services.ai.azure.com` where needed. Removed obsolete "Stop generation" section from README.md (lines 73-75) — this feature doesn't exist yet. Key learning: Azure SDK curl calls require explicit `api-version` parameter; documentation examples must be executable out of the box.

---

**📌 Session: 2026-03-14T** — Documentation Refresh

- ✅ Updated README Marketplace section from "planned" to insider/pre-release reality  
- ✅ Made all version references version-agnostic (glob patterns and examples)
- ✅ Updated sideload-test-checklist.md baseline to 0.2.0

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
- **Endpoint URL updates (2026-03-10):** Updated all documentation example URLs from `https://resource.openai.azure.com/` to `https://resource.services.ai.azure.com/` across four files: README.md (5 instances total), docs/configuration-reference.md (18+ instances including format specifications and examples), .github/copilot-instructions.md (1 instance), and specs/PRD-airgapped-copilot-vscode-extension.md (1 instance). Added backward compatibility note in configuration-reference.md explaining both `.services.ai.azure.com` and `.openai.azure.com` are valid Azure endpoints. Key learning: `.services.ai.azure.com` is Azure's current generic endpoint format for AI Foundry; documentation examples should reflect current best practice without breaking existing deployments.
