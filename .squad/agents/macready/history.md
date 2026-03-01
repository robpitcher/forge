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

### 2026-02-28: UI Enhancement Feasibility Analysis

**Requested by:** Rob Pitcher

**Proposals:**
1. Model selector dropdown in chat UI (query AI Foundry for available models on auth, show in dropdown)
2. Improve Entra ID authentication UX (make flow more obvious/easier)

**Analysis — Enhancement 1: Model Selector Dropdown**

**Feasibility:** Medium-High complexity. Feasible but requires significant work.

**Architecture Impact:**
- WebviewView has full control over UI — adding a dropdown is straightforward (HTML/CSS/JS in `media/chat.js`)
- Challenge: **Azure AI Foundry has no standard "list models" API** in the OpenAI-compatible endpoint format
  - OpenAI `/v1/models` endpoint exists, but Azure's implementation is inconsistent across regions/SKUs
  - Would need to query `{endpoint}/models` and parse response, with error handling for unsupported endpoints
- Alternative: **Azure Management API** (`management.azure.com`) for listing deployments — requires separate auth (ARM token, not API key or Cognitive Services token)
  - Massive scope increase: new auth provider, new API client, different permissions model
  - Air-gapped environments may not have ARM API access even if they have data plane access

**Key Trade-offs:**
1. **Data plane query (OpenAI `/v1/models`):**
   - ✅ Simple, uses existing auth (API key or Cognitive Services token)
   - ✅ No new permissions required
   - ❌ Unreliable — endpoint may not support listing, may return stale data
   - ❌ Extra network call on auth (latency hit in air-gap)
   
2. **Management plane query (ARM API):**
   - ✅ Authoritative — returns actual deployment names from Azure resource
   - ❌ Requires ARM token (different auth flow, separate permissions)
   - ❌ Likely blocked in air-gapped environments (ARM is often unavailable even when data plane is accessible)
   - ❌ High complexity for marginal UX benefit

3. **Local config file (JSON in user workspace):**
   - ✅ Works in all environments
   - ✅ Zero auth complexity
   - ❌ Manual maintenance by user
   - ❌ Defeats the point of "querying" AI Foundry

**Components to Change:**
- `media/chat.js`: Add `<select>` dropdown above input area, populate on load, send selected model with prompt
- `media/chat.css`: Style model selector dropdown
- `src/extension.ts`: Add `queryModels` command handler to call AI Foundry `/v1/models` endpoint
- `src/configuration.ts`: Make `model` setting optional (default: first model from query)
- Extension → webview messaging: Add `modelsLoaded` message type with model list

**Gotchas:**
1. **First auth chicken-egg problem** — can't query models until user authenticates, but user sees empty dropdown until first successful auth. Need loading state + fallback to settings.
2. **Caching stale model list** — if user queries models, then deployment is deleted/renamed, dropdown shows wrong options. Need refresh button or TTL.
3. **Error handling for unsupported endpoints** — some Azure regions/SKUs don't expose `/v1/models`. Need graceful fallback to settings-based flow.
4. **Webview lifecycle** — model list needs to persist across webview reload (store in extension state, re-send on `resolveWebviewView`).

**Recommendation:** **Defer to Phase 6 (Multi-Model)** or implement as **local config file** pattern instead of querying.
- Querying AI Foundry for models is unreliable and adds complexity with marginal benefit.
- Most air-gapped deployments have 1-3 known models; dropdown from a user-editable JSON file (`~/.forge/models.json` or workspace `.vscode/forge-models.json`) is simpler and more reliable.
- If Rob wants the "feels like GitHub Copilot" UX, recommend **hardcoded model list** in UI based on common Azure AI Foundry models (gpt-4.1, gpt-5, etc.) with a "Custom..." option that opens settings.

---

**Analysis — Enhancement 2: Entra ID Auth Flow UX**

**Feasibility:** Low-Medium complexity. Several viable options with different trade-offs.

**Current State:**
- Silent auth using `@azure/identity` `DefaultAzureCredential` (Azure CLI, VS Code Azure extension, Managed Identity, environment variables)
- No UI during auth — token acquisition happens in background
- Errors surface as generic messages in chat: "Entra ID authentication failed. Ensure you're signed in via Azure CLI..."

**Problem:**
- Users don't know *when* auth is happening or *which* credential source was used
- First-time setup is confusing — no prompt to sign in, just an error message
- No way to force re-auth or switch credential source

**Options to Improve UX:**

**Option 2A: Status Bar Item (Low Complexity)**
- Add status bar item (bottom-left) showing auth status: "🔒 Forge: Not Authenticated" / "✅ Forge: Authenticated (Azure CLI)" / "⚠️ Forge: Auth Error"
- Click opens quick pick: "Sign in with Azure CLI", "Use Managed Identity", "Switch to API Key", "Open Settings"
- Shows which credential source succeeded (Azure CLI, VS Code, Managed Identity)
- **Components:** New `src/auth/authStatusProvider.ts`, status bar item in `extension.ts`, click handler
- **Pros:** Non-intrusive, always visible, actionable
- **Cons:** Can't auto-trigger Azure CLI sign-in from VS Code (user must run `az login` in terminal manually)

**Option 2B: Welcome View in Sidebar (Medium Complexity)**
- Show welcome view in Forge sidebar when not authenticated (replaces chat UI)
- Buttons: "Authenticate with Entra ID", "Use API Key", "Configure Settings"
- After auth succeeds, replace with chat UI
- **Components:** New webview state (`authenticated` boolean), conditional HTML in `_getHtmlForWebview`, auth flow wiring
- **Pros:** Obvious first-run experience, guides user through auth
- **Cons:** Blocks chat UI until auth — annoying if auth is already configured but token expired

**Option 2C: Inline Auth Prompt in Chat (Low Complexity)**
- On first chat attempt with Entra ID configured, show inline message in chat stream:
  - "🔒 Authenticating with Entra ID..."
  - "✅ Authenticated via Azure CLI" (on success)
  - "❌ Authentication failed. [Try Again] [Switch to API Key] [Open Settings]" (on error)
- **Components:** New message type in `media/chat.js`, enhanced error rendering in `extension.ts`
- **Pros:** Minimal disruption, contextual (only shows when user tries to chat)
- **Cons:** Still doesn't solve the "how do I sign in?" problem for first-time users

**Option 2D: VS Code Authentication Provider (High Complexity)**
- Register a VS Code Authentication Provider (`vscode.authentication.registerAuthenticationProvider`)
- VS Code native auth UI: "The extension 'Forge' wants to sign in using Azure"
- Redirect to Azure OAuth flow (or Azure CLI)
- **Components:** New `src/auth/forgeAuthProvider.ts` implementing `vscode.AuthenticationProvider`, session storage
- **Pros:** Native VS Code UX, familiar to users
- **Cons:** Massive complexity, requires OAuth client ID registration (may not work in air-gap), overkill for DefaultAzureCredential

**Recommended Approach: Option 2A (Status Bar) + Option 2C (Inline Prompt)**
- **Status bar item** for persistent visibility and manual control
- **Inline auth prompt** on first chat attempt for contextual feedback
- **Enhanced error messages** with actionable buttons: "Run 'az login'", "Switch to API Key", "Open Settings"

**Components to Change:**
- `src/auth/authStatusProvider.ts` (new): Status bar item, click handler
- `src/extension.ts`: Register status bar item, update on auth success/failure
- `media/chat.js`: Render auth status messages with action buttons
- `src/auth/credentialProvider.ts`: Detect which credential source succeeded (Azure CLI vs VS Code vs MI) and return metadata
- `package.json`: No new settings (use existing `forge.copilot.authMethod`)

**Complexity:** Low-Medium
- Status bar: ~50 lines (new file + registration)
- Inline prompt: ~30 lines (webview message type + rendering)
- Credential source detection: ~20 lines (inspect `DefaultAzureCredential` internals or add logging)

**Gotchas:**
1. **Detecting credential source** — `DefaultAzureCredential` doesn't expose which provider succeeded. Need to either:
   - Try each provider individually (AzureCliCredential, EnvironmentCredential, ManagedIdentityCredential) and detect which one works (adds auth latency)
   - Parse error messages (fragile)
   - Just show "Authenticated via Entra ID" without specifics (acceptable)
2. **Azure CLI sign-in from VS Code** — can't auto-trigger `az login` from extension. Best we can do: show terminal with command pre-filled (`vscode.window.createTerminal` + `sendText("az login")`)
3. **Token expiry during session** — current implementation fetches token once at session creation (~1hr lifetime). If token expires mid-session, user sees API error. Status bar can show "⚠️ Token Expired" and prompt re-auth.

**Recommendation:** **Implement Option 2A + 2C (Status Bar + Inline Prompt).** Low-medium effort, high UX impact, no architecture changes.

---

**Summary for Rob:**

| Enhancement | Feasibility | Complexity | Recommendation |
|-------------|-------------|------------|----------------|
| **Model Selector Dropdown** | Medium-High | Medium-High | **Defer or use local config file.** Querying AI Foundry is unreliable; most air-gapped envs have 1-3 known models. Dropdown from JSON config is simpler. |
| **Entra ID Auth UX** | High | Low-Medium | **Implement (Status Bar + Inline Prompt).** Clear wins: persistent auth status, actionable errors, detect credential source. ~100 lines, no SDK/API changes. |

**Next Steps:**
- If Rob approves Enhancement 2, can spec it as a new issue for Phase 3b (post-Entra ID auth implementation)
- Enhancement 1 needs more discussion — is the goal to avoid editing settings, or to support dynamic model discovery? If the former, a local config file achieves the same UX with 1/10th the complexity.

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

📌 Team update (2026-02-27T17:00:00Z): MVP batch completion. Documentation update for WebviewView support (#52) completed in parallel with Windows (#59, #57) and Blair (#56). Session logs written to .squad/orchestration-log/ and .squad/log/. All PRs targeting dev. — completed by MacReady, Scribe orchestration

### 2026-02-28: Phase 2 Issue Rescope — #25 (Tools) and #26 (Context)

**Requested by:** Rob Pitcher

**Work Completed:**
- Rescoped Issue #25 (Enable Copilot CLI built-in tools) and Issue #26 (Add workspace context and editor selection) for the current WebviewView architecture.
- Both issues were written when the extension used Chat Participant API. The architecture now uses WebviewViewProvider with custom HTML/CSS/JS chat UI, so both needed significant rework.
- Decision document written to `.squad/decisions/inbox/macready-phase2-rescope.md`.

**Issue #25 Rescope Summary (Tools):**
- Not just removing `availableTools: []` — need full tool approval UX.
- Designed inline confirmation cards in the webview chat stream (tool name, path, action + Approve/Reject buttons).
- Added `forge.copilot.autoApproveTools` boolean setting (default: false) for trusted environments.
- Tool results rendered in chat stream after execution.
- Routing: Childs (primary, SDK events) + Blair (secondary, webview UX).

**Issue #26 Rescope Summary (Context):**
- No built-in `@workspace` — must build context attachment from scratch.
- Designed `forge.attachSelection` and `forge.attachFile` commands with webview context chips.
- Context prepended to prompt string sent to `session.send()` with size truncation.
- "Attach Selection" button in view/title bar alongside settings gear.
- Routing: Blair (primary, VS Code API + webview) + Childs (secondary, prompt construction).

**Key Learnings:**
1. **WebviewView has no built-in context variables** — unlike Chat Participant API which provides `@workspace` and `#selection`, all context capture must be built manually using `vscode.window.activeTextEditor`.
2. **Tool approval in WebviewView requires custom UI** — Chat Participant API may handle tool confirmations natively, but our webview needs inline confirmation cards rendered in the chat stream with postMessage round-trips.
3. **Both Phase 2 issues are larger than originally scoped** — the Chat Participant → WebviewView migration means features that would have been "turn on a flag" become "build the UX from scratch."
4. **SDK tool event model is TBD** — need to verify the exact event names for tool calls from `@github/copilot-sdk` before implementation begins. Childs should investigate SDK docs first.
5. **Context size management is important** — attaching full files to prompts can blow token limits. Need truncation with user-visible notes.

### 2026-02-28: Design Review — #27 DefaultAzureCredential Auth

**Ceremony:** Design Review (pre-implementation)
**Issue:** #27 — Phase 3a DefaultAzureCredential auth support

**Key Architecture Decisions:**
1. New `src/auth/credentialProvider.ts` module with `CredentialProvider` interface (`getToken(): Promise<string>`), two implementations (`EntraIdCredentialProvider`, `ApiKeyCredentialProvider`), and factory function.
2. `getOrCreateSession()` signature changes to accept `authToken: string` — caller resolves token before calling. Keeps copilotService free of auth concerns.
3. Dynamic `import("@azure/identity")` in the factory to avoid loading the package in apiKey mode.
4. `forge.copilot.authMethod` enum setting with `"entraId"` (default) and `"apiKey"` values.
5. Validation skips API key check when `authMethod === "entraId"` — Entra failures surface at token acquisition time.

**File Ownership (for parallel implementation):**
- Childs: `src/auth/credentialProvider.ts` (new), `src/copilotService.ts` (session auth wiring)
- Blair: `package.json` (setting + dep), `src/configuration.ts` (authMethod field + validation), `src/extension.ts` (caller wiring)
- Windows: Tests for both auth paths, VSIX size validation
- Docs: README, config reference, installation guide updates

**Risks Flagged:**
1. `@azure/identity` bundle size may push VSIX past 10MB limit — measure after adding dep
2. Air-gapped Entra ID requires IMDS (Managed Identity) or pre-auth; document limitation
3. Token expiry mid-session acceptable for Phase 3a; defer session recreation to Phase 3b
4. `DefaultAzureCredential` error messages are verbose — need user-friendly wrapping
5. Breaking signature change on `getOrCreateSession()` requires coordinated work

**Decision document:** `.squad/decisions/inbox/macready-entra-auth-design.md`

### 2026-02-28: Copilot Instructions — Coding Standards Expansion

**Requested by:** Rob Pitcher

**Work Completed:**
- Expanded `.github/copilot-instructions.md` with 8 new sections (Project Overview, Architecture & File Ownership, Copilot SDK Conventions, TypeScript Conventions, Testing Conventions, VS Code Extension Conventions, Error Handling Standards, Security)
- Preserved existing Branching Strategy and Squad Integration sections
- Branch: `squad/copilot-instructions-standards`, pushed to origin

**Conventions Documented:**
1. BYOK provider config pattern (`type: "openai"`, `baseUrl`, `apiKey`/`bearerToken`, `wireApi`)
2. Named event handler pattern (`.on(eventName, handler)` returning unsubscribe fn)
3. `session.send({ prompt })` not `session.sendMessage()`
4. `bearerToken` static string limitation (no refresh callback, see #27)
5. `availableTools: []` for MVP
6. `import type` for type-only imports, `.js` extensions in import paths
7. Mock patterns: `DefaultAzureCredential` as class, `SecretStorage` shape, async `createCredentialProvider`
8. WebviewView message protocol (8 extension→webview types, 2 webview→extension types)
9. "Never throws" contract: catch ALL async ops including SecretStorage
10. Air-gap compliance: no external calls except Azure AI Foundry endpoint

**Key File Paths Referenced:**
- `.github/copilot-instructions.md` — the file modified
- `src/extension.ts`, `src/copilotService.ts`, `src/configuration.ts` — core modules
- `src/auth/credentialProvider.ts`, `src/auth/authStatusProvider.ts` — auth layer
- `src/types.ts`, `media/chat.js`, `media/chat.css` — types and webview
- `src/test/__mocks__/`, `src/test/webview-test-helpers.ts` — test infrastructure
- `.squad/skills/copilot-sdk-byok/SKILL.md`, `.squad/skills/copilot-sdk-cookbook/SKILL.md`, `.squad/skills/copilot-sdk-nodejs-api/SKILL.md` — SDK reference skills consulted

**Decision document:** `.squad/decisions/inbox/macready-copilot-instructions-standards.md`

### 2025-07-25: PR #83 Review Fix — copilot-instructions.md

**Work Completed:**
- Fixed 4 unresolved Copilot review comments on `squad/copilot-instructions-standards` branch
- Rebased on `origin/dev` (clean, no conflicts) and force-pushed

**Fixes Applied:**
1. Removed ghost file `src/auth/authStatusProvider.ts` from architecture map — only `credentialProvider.ts` exists
2. BYOK provider type: changed example from `type: "openai"` to `type: "azure"` for `.azure.com` endpoints (matches `copilotService.ts` line 76-78)
3. Event payload: `event.data.deltaContent` not `event.data.delta.content` (matches `extension.ts` line 362)
4. Message protocol tables synced with actual code: added `contextAttached`, `conversationReset` to ext→webview; added `newConversation`, `attachSelection`, `attachFile`, `chatFocused`, `openSettings` to webview→ext

**Key Insight:** The `authStatusProvider.ts` file was referenced in the original instructions but never existed on this branch — likely a planned-but-not-yet-implemented module. The `authStatus` message type IS in the table (added on another branch) and was kept.
