# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/extension.ts` — Activation, chat participant registration, request handler
- `src/copilotService.ts` — CopilotClient lifecycle, BYOK session creation
- `src/configuration.ts` — VS Code settings reader and validator
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Product requirements (source of truth)
- `package.json` — Extension manifest, chat participant contribution, settings schema

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->


## Core Context

**Key milestones from prior analysis:**
- PRD decomposition: 8 functional requirements (FR1-FR8), 9 non-functional requirements (NFR1-NFR9)
- MVP architecture: WebviewView sidebar, BYOK mode, session reuse, streaming, error handling
- SDK usage: `workingDirectory` support verified but not yet utilized
- Triage: 23 MVP issues evaluated and routed appropriately

**Decisions documented:** See .squad/decisions.md for full record.

---

## Recent History (Full Details)

### 2026-03-01: Phase 4 Scope Pivot — Tools-First Architecture

**Decision:** Slash commands (#85) should be closed. The Copilot SDK (v0.1.26) is a full coding agent with built-in tools (`shell`, `read`, `write`, `url`, `mcp`). Hardcoded prompt prepends (/explain, /fix, /tests) duplicate what the model does natively. Rob Pitcher identified this — he's right.

**SDK Tool Capabilities Discovered:**
- `SessionConfig.availableTools` / `excludedTools` — whitelist/blacklist built-in tools
- `defineTool()` — register custom tools with typed Zod schemas
- `SessionConfig.mcpServers` — local/remote MCP server integration
- `SessionConfig.customAgents` — sub-agents with specific tool sets
- `SessionConfig.skillDirectories` / `disabledSkills` — skill support
- `SessionConfig.systemMessage` — append or replace system prompt
- `onUserInputRequest` — enables `ask_user` tool
- Session hooks: `onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`
- Events: `tool.execution_progress`, `tool.execution_partial_result` (not yet consumed)
- `PermissionRequest.kind`: `"shell" | "write" | "mcp" | "read" | "url"`

**Existing Forge Tool Plumbing (already working):**
- `onPermissionRequest` handler with auto-approve setting
- `tool.execution_start` → `toolConfirmation` webview message
- `tool.execution_complete` → `toolResult` webview message
- `autoApproveTools` configuration setting

**Issue Disposition:**
- #85 (Slash commands) → Close, won't implement
- #86 (Code actions) → Rework: remove dependency on #85, use native `session.send()` with attachments
- #87 (Conversation history) → Keep as-is

**New Phase 4 Focus:** Tool UX polish, tool control settings (availableTools/excludedTools), conversation history (#87), reworked code actions (#86), system message customization, MCP server support (stretch).

**Decision file:** `.squad/decisions/inbox/macready-phase4-tool-first-pivot.md`

### 2026-03-03: README Accuracy Review (post-Fuchs PR fixes)

**Reviewed:** README.md against package.json, src/extension.ts, src/copilotService.ts, src/configuration.ts, src/auth/credentialProvider.ts, src/auth/authStatusProvider.ts, src/codeActionProvider.ts, media/chat.js, src/types.ts.

**Findings:**
- Architecture diagram: Accurate (WebviewView → Extension Host → Copilot CLI via stdio → Azure AI Foundry).
- Source files list: All 9 files listed, all exist, descriptions accurate.
- Prerequisites: VS Code 1.93, Node 20.19.0+ — both match `package.json` engines. ✅
- Configuration: All 14 settings (6 core + 6 tool + 2 MCP) documented, all match `package.json` contributes.configuration exactly — types, defaults, descriptions all correct.
- Features: Auth methods (Entra ID + API Key), Code Actions (Explain/Fix/Tests), Model Selector — all implemented and accurately described.
- Chat Modes: Correctly marked as *(planned)*. Zero ChatMode code exists in `src/` or `media/`.
- Version: `0.1.0` matches package.json. VSIX filename reference correct.
- Development commands: `build`, `watch`, `test`, `package` all correct.

**One issue fixed:** `npm run lint` description said "Type-checks code with TypeScript" — actually runs ESLint (`eslint src/`). Type-checking is `npm run lint:types` (`tsc --noEmit`) which wasn't documented. Fixed description and added `lint:types` command.

### Documentation Audit — PR #116 Consistency Pass

**Work Completed:**
Thorough audit of all documentation files for consistency, accuracy, and positioning alignment after many rounds of PR #116 changes.

**Issues Found & Fixed:**

1. **`docs/configuration-reference.md` — Critical drift (11 fixes):**
   - `forge.copilot.model` (singular string, default `gpt-4.1`) → `forge.copilot.models` (string array, default `[]`) throughout — 8 occurrences
   - Endpoint URL format said to include `/openai/v1/` — SDK auto-appends this. Removed from all examples and format docs.
   - "bottom panel" → "sidebar" for Forge icon location
   - Added missing settings to Optional Settings table: `authMethod`, `systemMessage`, `autoApproveTools`
   - Fixed required-settings section: was saying API key is required, but Entra ID is default auth
   - Updated all 5 example configurations to use correct setting names and endpoint format
   - Fixed Summary section: was listing `apiKey` as required
   - "air-gapped environments" → "restricted networks" in summary
   - Dead anchor link `#api-key-storage-via-secretstorage` → replaced with correct reference
   - Updated troubleshooting curl commands to match correct endpoint format

2. **`docs/sideload-test-checklist.md` — 5 fixes:**
   - "model name" → "deployment name" in prerequisites
   - "bottom panel" / "panel area" → "activity bar" / "sidebar" (3 locations)
   - `Forge: Copilot Model` → `Forge: Copilot Models` with array syntax
   - Added Entra ID as default auth option (was API-key-only)
   - "air-gapped environment" → "restricted or disconnected environments"

3. **`package.json` — 3 positioning fixes:**
   - `enumDescriptions` for apiKey: "air-gapped environments" → "environments"
   - URL tool description: "air-gapped environments" → "restricted environments"
   - MCP remote description: "air-gap safety" → "network safety"

**Key Learnings:**
- The `forge.copilot.model` → `forge.copilot.models` rename was the biggest drift — the config reference was never updated when the setting changed from singular string to array.
- Endpoint URL format documentation was actively harmful — telling users to include `/openai/v1/` would cause double-pathing since the SDK auto-appends it.
- "Air-gapped" as primary positioning was cleaned from README earlier but leaked through in package.json descriptions and docs.


📌 Team update (2026-03-02T22:30:00Z): Welcome Screen State Management Pattern and design decision finalized — decided by Blair + Windows (postConfigStatus implementation and clear API key feature merged)


---

## Archived Decisions (Summary)

Prior architectural analysis and design decisions archived. Check .squad/decisions.md for complete record.

- 2026-02-27: Documentation Delivery — Installation & Configuration Guides
- 2026-02-27 (Evening): PRD Work Decomposition
- 2026-02-27 (Late): MVP Backlog Triage Completion
- 2026-02-27: PRD Decomposition & Code Review
- 2026-02-27: MVP Backlog Triage Execution
- 2026-02-28: UI Enhancement Feasibility Analysis
- 2026-02-27 (Evening): Architecture Documentation Update — WebviewView Sidebar
- 2026-02-28: Phase 2 Issue Rescope — #25 (Tools) and #26 (Context)
- 2026-02-28: Design Review — #27 DefaultAzureCredential Auth
- 2026-02-28: Copilot Instructions — Coding Standards Expansion
- 2025-07-25: PR #83 Review Fix — copilot-instructions.md
- 2025-07-25: Issue #28 Phase 4 Implementation Spec
