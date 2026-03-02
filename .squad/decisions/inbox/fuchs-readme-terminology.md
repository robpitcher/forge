# Decision: Use "Copilot CLI" terminology consistently

**Author:** Fuchs (Technical Writer)
**Date:** 2025-07-15
**Context:** PR #116 review feedback

## Decision

All documentation should refer to the local process spawned by the SDK as **"Copilot CLI"** (binary name: `copilot`), not "Copilot Language Server" or "copilot-language-server".

## Rationale

The binary shipped from `github/copilot-cli` is called `copilot`, and the repo/distribution is named `copilot-cli`. Using "Language Server" was inaccurate and confusing — it's a CLI tool communicating over stdio, not an LSP language server.

## Scope

- README.md (updated in PR #116)
- Any future docs, error messages, or setting descriptions that reference the binary
- The `forge.copilot.cliPath` setting description already uses the correct term

## Chat Modes — Planned Feature

The Chat Modes section (Chat/Agent/Plan) was documented as if a mode selector exists in the UI. Confirmed via codebase search: no `ChatMode` type or mode dropdown exists. Marked as *(planned)* in README. When the feature ships, remove the planned label and update the description.
