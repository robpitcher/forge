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
