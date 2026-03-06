# Fuchs — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Core Context

Fuchs is Forge's Technical Writer. Primary work: documentation (README.md, CONTRIBUTING.md, configuration guides) and technical content (Slidev decks, changelogs). Key principles: (1) **Link to canonical sources** — avoid duplicating upstream docs (Copilot CLI repo, Slidev.dev, Azure SDK docs); (2) **Version-agnostic examples** — use glob patterns and placeholders to reduce maintenance; (3) **User-first framing** — prioritize common/accessible paths (VS Code Marketplace before sideload; basic deployments before enterprise patterns); (4) **Terminology precision** — use "Copilot CLI" consistently, not "Language Server"; distinguish deployment names from model names in Azure AI Foundry. Major deliverables: comprehensive CONTRIBUTING.md (fork → branch → full check → PR workflow), README repositioning (organizational control + private endpoints as headline, air-gapped as one scenario), installation guide unification (GitHub Releases for air-gapped, Marketplace for users), endpoint URL standardization (`*.services.ai.azure.com`), CHANGELOG.md (Keep a Changelog format), and Slidev skill/deck work. Known limitations: Chat Modes are planned but not shipped; no mode selector UI exists yet.

## Recent Work

### Major Features & Docs

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

## 2026-03-06T00-05-00Z: Slidev Presentation Deck Delivered

📌 Team update (2026-03-06): Slidev presentation deck created with isolated project structure in `slides/`, 9-slide content (cover, problem, architecture, features, enterprise setup, links), static assets, GitHub Pages base path (`/forge/`). Deployment workflow to be handled by Palmer/DevOps. — Fuchs (Technical Writer)

**Outcome:** 9 slides, GitHub Pages ready (pending Palmer's workflow). Decision merged to team decisions.md.
