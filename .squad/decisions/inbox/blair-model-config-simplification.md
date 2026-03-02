### Model Config Simplification — Single `models[]` Setting

**By:** Blair (Extension Dev)
**Issue:** #81
**PR:** #111

## Decision

Consolidated two model settings (`forge.copilot.model` + `forge.copilot.models`) into one: `forge.copilot.models` (array). The active model defaults to `models[0]` and is persisted in `workspaceState` when the user selects a different model from the dropdown.

## Changes

- `forge.copilot.model` (singular) removed from `package.json` and `ExtensionConfig`
- Active model tracked via `workspaceState.get("forge.selectedModel")` — not a user-facing setting
- `copilotService.getOrCreateSession()` and `resumeConversation()` accept `model` as an explicit parameter
- `_getActiveModel(models)` validates persisted selection against current models array

## Rationale

- Users configure ONE thing (the list of available models), not two
- The "active" model is runtime state, not configuration — belongs in workspaceState
- If a user removes a model from their array after selecting it, the extension gracefully falls back to `models[0]`
- Service layer accepts model as parameter for clearer separation of concerns
