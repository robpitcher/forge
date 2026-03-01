# Model Selector UI Pattern

**Date:** 2026-03-01
**Author:** Blair (Extension Dev)
**Issue:** #81
**PR:** #111

## Decision

Model switching requires a confirmation dialog and full session reset. The `forge.copilot.models` setting provides the dropdown options, while `forge.copilot.model` remains the active model. The dropdown is placed in the button row with `margin-left: auto` for right-alignment.

## Rationale

- Model changes affect the entire conversation context, so resetting is safer than silently switching mid-conversation
- Confirmation prevents accidental model switches that would lose conversation state
- Separating `models` (available list) from `model` (active selection) allows the list to be configured once while the active model changes per-conversation
