# Session Log: Endpoint Example Update
**Timestamp:** 2026-03-02T16:49:00Z  
**Agents:** Blair (Extension Dev), Fuchs (Technical Writer)  

## What Happened
Rob discovered that model validation doesn't work with serverless Foundry endpoints (`.models.ai.azure.com`) because the model is baked into the URL. He requested updating all user-facing endpoint examples from `openai.azure.com` to the current generic Foundry format `services.ai.azure.com`.

**Blair** updated code examples:
- `package.json` settings description
- `src/configuration.ts` validation error message
- Build and tests passed

**Fuchs** updated documentation examples:
- README.md (3 examples)
- docs/configuration-reference.md (15+ examples)
- .github/copilot-instructions.md (1 example)
- specs/PRD-airgapped-copilot-vscode-extension.md (1 example)
- Added backward-compatibility note

## Key Decisions
- `services.ai.azure.com` is the standard Azure AI Foundry endpoint format
- Both `.services.ai.azure.com` and `.openai.azure.com` remain valid (SDK regex `/\.azure\.com/i` matches both)
- No logic changes needed; docs-only update to examples

## Status
✅ Both agents completed successfully. Code and documentation now reflect current Azure endpoint format.
