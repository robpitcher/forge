# Fuchs — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Learnings

- **Endpoint URL updates (2026-03-10):** Updated all documentation example URLs from `https://resource.openai.azure.com/` to `https://resource.services.ai.azure.com/` across four files: README.md (5 instances total), docs/configuration-reference.md (18+ instances including format specifications and examples), .github/copilot-instructions.md (1 instance), and specs/PRD-airgapped-copilot-vscode-extension.md (1 instance). Added backward compatibility note in configuration-reference.md explaining both `.services.ai.azure.com` and `.openai.azure.com` are valid Azure endpoints. Key learning: `.services.ai.azure.com` is Azure's current generic endpoint format for AI Foundry; documentation examples should reflect current best practice without breaking existing deployments.
