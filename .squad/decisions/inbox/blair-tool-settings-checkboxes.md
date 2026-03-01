# Decision: Tool Settings as Individual Checkboxes

**By:** Blair  
**Date:** 2026-03-01  
**PR:** #101

## What

Replaced `forge.copilot.excludedTools` (string array) with 5 individual boolean settings under `forge.copilot.tools.*`. Each tool gets its own checkbox in VS Code Settings UI. All default to `true` (enabled) except `url` which defaults to `false` for air-gap compliance.

## Why

Individual checkboxes are more discoverable and user-friendly than a string array. Users can toggle tools without knowing the exact tool name strings.

## Impact

- `ExtensionConfig` no longer has `excludedTools` — it has `toolShell`, `toolRead`, `toolWrite`, `toolUrl`, `toolMcp` booleans.
- `copilotService.ts` computes `excludedTools` array from booleans before passing to SDK.
- All test files with `ExtensionConfig` literals need the 5 tool boolean fields.
- SDK contract is unchanged — still receives `excludedTools` array.

## Also in This PR

Re-added `forge.copilot.systemMessage` setting (lost in PR #95 merge conflict). `ExtensionConfig.systemMessage` is optional string, passed as `{ systemMessage: { content } }` to SDK session creation.
