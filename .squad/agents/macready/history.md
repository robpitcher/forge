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

### 2026-02-27: Documentation Delivery — Installation & Configuration Guides

**Work Completed:**
- Created `docs/installation-guide.md` (Issue #19) — comprehensive CLI installation for air-gapped environments
- Created `docs/configuration-reference.md` (Issue #20) — complete Azure AI Foundry configuration reference
- Branch: `squad/19-20-docs`, PR: #45 (open to dev)

**Installation Guide Key Content:**
- Step-by-step Copilot CLI v0.0.418+ download from GitHub releases (with SHA256 verification instructions)
- Transfer procedures for disconnected environments (USB, secure portals, approved media)
- Installation paths: global PATH (Linux/macOS/Windows) vs local `enclave.copilot.cliPath` setting
- Verification: `copilot --version`, `copilot server`, E2E test in VS Code
- Troubleshooting table with 5 common issues (CLI not found, permission denied, wrong binary, server hangs, VS Code errors)

**Configuration Reference Key Content:**
- Settings table: 2 required + 3 optional, with type, default, and purpose
- **Endpoint URL format** documented: `https://{resource-name}.openai.azure.com/openai/v1/` with component breakdown
- **API key retrieval**: Step-by-step Azure Portal instructions with example screenshots (conceptual)
- **Deployment name vs model name distinction** with example table and Azure Portal walkthrough
- **wireApi setting** explained: `completions` (default, standard OpenAI format) vs `responses` (alternative format), with request JSON examples
- 5 full example configurations (minimal, custom model, custom CLI path, alternative wire format, Windows)
- Comprehensive troubleshooting with connection, auth, model, and format issues, plus debug curl commands

**Design Decisions:**
1. **Audience split**: Installation guide targets platform/DevOps engineers; configuration guide targets both engineers and developers
2. **Cross-references**: Both docs link to each other for workflow integration (install CLI first, then configure)
3. **Content sourcing**: All info derived from PRD Table FR6, `package.json` contributes.configuration, `src/configuration.ts`, and real Azure portal patterns
4. **Security note**: Configuration guide explicitly mentions API key security and defers Managed Identity to Phase 3
5. **Verification depth**: Installation guide includes curl/terminal verification commands, not just UI steps

**Learnings for Future Documentation:**
- Air-gapped documentation must cover download + transfer as two separate concerns; single "install" docs miss disconnected workflows
- Configuration docs should include "deployment name vs model name" as a dedicated section; this is a frequent source of confusion in Azure
- wireApi setting is not obvious from OpenAI docs; explicit JSON examples (both formats) help practitioners choose correctly
- Troubleshooting should include curl commands for self-service debugging in air-gapped environments where Copilot support is limited
- Cross-references between related docs (installation → configuration) improve user workflow

**PR Review Checklist:**
- [x] Both files created in `docs/` directory
- [x] Installation guide covers all four steps: download, transfer, install, verify
- [x] Configuration guide documents all 5 settings from `package.json`
- [x] Endpoint URL format matches Azure AI Foundry real-world patterns
- [x] Deployment name vs model name distinction is clear with examples
- [x] wireApi setting explained with JSON request examples for both formats
- [x] Troubleshooting sections included in both
- [x] Commit message includes signed trailer
- [x] PR body references both issues (#19, #20) and describes content

**Impact on Acceptance Criteria:**
- Issue #19 AC: ✅ Step-by-step CLI installation documented; ✅ download URL and version (v0.0.418+) documented; ✅ transfer procedure clear (approved media, USB, secure portals); ✅ verification step included (copilot --version, copilot server, E2E test)
- Issue #20 AC: ✅ Endpoint URL format documented with examples; ✅ API key retrieval steps from Azure portal; ✅ Deployment name vs model name explained; ✅ wireApi setting explained with use cases (completions for standard, responses for alternative endpoints)

### 2026-02-27 (Evening): PRD Work Decomposition

**Decomposition Strategy:**
- PRD maps to 28 work items: 8 foundational/core (P0), 4 testing (P0-P1), 6 packaging/documentation (P0-P1), 2 quality polish (P2), 8 post-MVP (Phase 2–6)
- MVP focus: Issues 1–23 (core, test, package, docs, polish). Post-MVP: Issues 24–28 (reference only).
- Work is ordered by dependency chain: scaffolding → core functionality → testing → packaging → documentation.
- Each issue is right-sized for one squad member in one session; avoids "add import" granularity and "build the extension" broadness.
- Testing issues (9–13, 16) are manual (no automated test suite in MVP); tie directly to success criteria SC1–SC7.

**Key Decomposition Decisions:**
1. **No automated tests for MVP** — per PRD and existing decisions, manual E2E testing via SC1–SC7 is the validation path.
2. **Session ID derivation (Issue 23, P2)** — flagged as a risk because VS Code `ChatContext.id` is not guaranteed by API docs. Deferred to post-MVP investigation.
3. **Type safety (Issue 20, P2)** — SDK is Technical Preview; `any` types are acceptable for MVP. Revisit when SDK stabilizes.
4. **Session cleanup (Issue 22, P2)** — deferred; no immediate risk for small PoC usage, but design should be sound for Phase 2.
5. **Managed Identity (Phase 3)** — deferred; API key is sufficient for MVP and most air-gapped environments. SecretStorage support also deferred.
6. **CLI bundling (Phase 5)** — deferred; users install CLI separately for MVP (documented in Issue 18). Bundling adds complexity and licensing questions.
7. **Tools (Phase 2)** — deliberately disabled in MVP (`availableTools: []`) to minimize scope and security surface.

**File Ownership Patterns:**
- `src/extension.ts`: Chat participant registration, request handler, streaming, error display, cancellation wiring
- `src/copilotService.ts`: CopilotClient lifecycle, BYOK session creation, session map management
- `src/configuration.ts`: VS Code settings reader, validation
- `package.json`: Manifest, chat participant contribution, settings schema

**Risks Identified (Already documented in decisions.md):**
- Conversation ID derivation assumes `ChatContext.id` exists (not guaranteed)
- Event listener cleanup uses defensive fallback (`session.off` vs `session.removeListener`)
- API key stored as plain string (not using SecretStorage)
- No E2E automated tests — all validation is manual

**Next Steps for Squad:**
1. **Windows**: Execute Issues 1 (scaffolding validation), 14–16 (build/package/sideload), 9–10, 13 (test happy path, air-gap, streaming)
2. **Blair**: Execute Issues 2–8 (all core functionality) and dependency-ordered tests 11–12, 21 (linting)
3. **Childs**: Execute Issues 5 (settings), 17–19 (README, CLI guide, Azure guide)
4. Remain flexible on Phase 2–6 roadmap based on customer feedback post-MVP.

---

### 2026-02-27 (Late): MVP Backlog Triage Completion

**Triage Execution:**
- Completed triage of all 23 MVP milestone issues
- 8 issues rerouted to @copilot (Coding Agent): #2, #6, #15, #16, #18, #19, #20, #22
- 15 issues confirmed with existing squad member assignments (Blair, Childs, Windows, MacReady)
- Triage decision documented and merged into `.squad/decisions.md` by Scribe

**Routing Rationale:**
- @copilot routed: scaffolding validation, build/package config, documentation, lint/format boilerplate
- Squad members retained: core architecture, SDK integration, design judgment, manual E2E testing, investigations

**Next Phase:**
- @copilot auto-picks up rerouted issues via heartbeat workflow
- Squad members begin work on confirmed assignments in dependency order
- MacReady monitors @copilot PR quality and escalates blockers

---

### 2026-02-27: PRD Decomposition & Code Review

**Architecture:**
- Extension uses VS Code Chat Participant API (`vscode.chat.createChatParticipant`) for native chat panel integration
- CopilotClient from `@github/copilot-sdk` manages JSON-RPC communication with local Copilot CLI process over stdio
- BYOK mode configured at session creation: `provider.type: "openai"`, `provider.baseUrl` (Azure AI Foundry), `provider.apiKey`
- Session lifecycle: lazy-create client on first chat, reuse sessions per conversation ID (derived from `ChatContext.id` or generated fallback)
- Event-driven streaming: `assistant.message_delta` events → `ChatResponseStream.markdown()`

**Key Patterns:**
- Lazy client initialization (`getOrCreateClient`) to avoid startup overhead
- Session Map keyed by conversation ID for multi-turn context reuse
- Defensive error handling: custom `CopilotCliNotFoundError` class, config validation before session creation, display errors in chat stream with settings button
- VS Code cancellation token wired to `session.abort()` for user-initiated stops

**Implementation Status:**
- Core functionality (FR1-FR6): ✅ Complete
- Error handling (FR7): ✅ Complete
- Packaging scripts (FR8): ✅ Defined, not yet validated
- Testing: ❌ No test suite; manual testing required for SC1-SC7

**Risks:**
- SDK type safety: `copilotService.ts` uses `any` types due to Technical Preview SDK (no exported TypeScript interfaces)
- Event listener cleanup logic has defensive fallback (`session.off` vs `session.removeListener`) suggesting API uncertainty
- Conversation ID derivation assumes `ChatContext.id` exists (not guaranteed by VS Code API docs)
- API key stored as plain string in settings (not using VS Code SecretStorage)

**File Ownership:**
- `src/extension.ts`: Activation, chat participant registration, request handler, streaming response logic
- `src/copilotService.ts`: CopilotClient lifecycle, BYOK session creation with Azure AI Foundry config
- `src/configuration.ts`: VS Code settings reader, validation logic for required fields (endpoint, apiKey)
- `package.json`: Extension manifest, chat participant contribution, settings schema (5 settings: endpoint, apiKey, model, wireApi, cliPath)

---

### 2026-02-27: MVP Backlog Triage Execution

**Triage Summary:**
- 23 MVP issues triaged: 8 rerouted to @copilot, 15 confirmed with current squad assignments
- All issues now have MacReady triage comments with routing rationale
- Label swaps completed: #2, #6, #15, #16, #18, #19, #20, #22 → `squad:copilot`

**@copilot Routing Philosophy:**
- **Good fit (🟢)**: Scaffolding validation, build/package config, documentation, lint/format boilerplate
- **Needs review (🟡)**: Medium features where code exists and needs validation (e.g., #6 settings schema)
- **Not suitable (🔴)**: Core architecture, SDK integration, manual testing, investigations

**Key Learnings:**
1. **@copilot excels at mechanical work** — config validation, documentation from clear specs, boilerplate tooling
2. **Squad members own complexity** — VS Code extension API, SDK lifecycle, UX judgment, manual E2E testing
3. **Issue #6 flagged for review** — settings schema code already exists in `package.json` lines 36-64; @copilot should validate compliance, not rewrite
4. **Auto-assign is enabled** — @copilot picks up `squad:copilot` labeled issues via heartbeat workflow; no manual assignment needed
5. **Flexible reassignment** — swapping `squad:*` labels is the standard handoff mechanism

**Triage Execution Pattern:**
1. Relabel issues first (8 label swaps: old `squad:{member}` → new `squad:copilot`)
2. Add triage comments to ALL issues (23 total) — both rerouted and confirmed
3. Write triage decision document to `.squad/decisions/inbox/macready-mvp-triage.md`
4. Update history with learnings

**GitHub CLI Usage:**
- `gh issue edit {number} --remove-label "squad:{old}" --add-label "squad:{new}" --repo robpitcher/enclave`
- `gh issue comment {number} --body "..." --repo robpitcher/enclave`

**Next Steps:**
- @copilot will auto-pick up 8 rerouted issues via heartbeat
- Squad members continue work on confirmed assignments in dependency order
- Monitor @copilot PR quality for issues #2, #6, #15, #16, #18, #19, #20, #22

### 2026-02-27 (Evening): Architecture Documentation Update — WebviewView Sidebar

**Issue:** #52 — Update documentation for standalone WebviewView architecture (priority P1, should-have for MVP)

**Work Completed:**
- **README.md** (multiple edits)
  * Updated introduction: "sidebar chat interface" instead of "local Copilot Chat"
  * Fixed first architecture diagram: Chat Panel → Enclave Sidebar (WebviewView), updated streaming flow
  * Quick Start (step 3): Click Enclave icon instead of Ctrl+L / @copilot workflow
  * Quick Start (step 4-5): Removed @copilot references, emphasize sidebar chat
  * Usage section: Removed all @copilot mentions, sidebar-native interaction
  * Example prompts: Removed @copilot prefix
  * Added F5 debug launch to Watch mode section
  * Fixed second architecture diagram similarly
  * Updated source files description: WebviewViewProvider instead of chat participant

- **docs/installation-guide.md** (1 section)
  * Step 4.3 (Test the Extension): Click sidebar icon instead of "Open Copilot Chat" and @copilot prefix

- **specs/PRD-airgapped-copilot-vscode-extension.md** (7 key updates)
  * Executive Summary: Added architecture evolution note explaining migration from Chat Participant to WebviewView
  * Goal G1: "open a sidebar" with WebviewView instead of "chat panel" with Chat Participant API
  * Goal G4: Streaming tokens appear in "sidebar" not "chat panel"
  * Goal G6: Errors display in "sidebar" not "chat panel"
  * Architecture diagram: Chat Panel → Enclave Sidebar (WebviewView)
  * FR1: Complete rewrite from "Chat Participant Registration" → "WebviewView Sidebar Registration"
    - Explains view container, view IDs, display name, icon config in package.json
  * FR7 error table: Changed error display from "chat" to "sidebar" for all error conditions

**Branch & PR:**
- Branch: `squad/52-docs-update-clean` (created fresh from `dev`)
- Will push and create PR targeting `dev`

**Scope Clarifications:**
- Configuration reference (docs/configuration-reference.md) had no Chat Participant references — no changes needed
- Historical context in PRD (later sections mentioning Chat Participant API design notes) left intact for historical record
- Focus: User-facing docs (README, installation guide, current requirements in PRD)

**Acceptance Criteria (from issue #52):**
- ✅ No references to Chat Participant API in user-facing documentation
- ✅ No `@enclave` or `@copilot` references in normal workflows
- ✅ README shows sidebar usage (click icon, type, press Enter)
- ✅ Installation guide reflects sidebar testing  (click icon instead of Ctrl+L)
- ✅ PRD updated with architecture change (FR1 fully rewritten, Executive Summary note added)

**Files Modified:**
- README.md (11 edits: intro, 2 architecture diagrams, Quick Start, Usage, source files, Watch mode)
- docs/installation-guide.md (1 edit: step 4.3 testing)
- specs/PRD-airgapped-copilot-vscode-extension.md (7 edits: Executive Summary, Goals, Architecture, FR1, FR7)
