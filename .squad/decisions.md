# Decisions

> Team decisions that all agents must respect. Append-only — never edit past entries.

<!-- New decisions are merged here by Scribe from .squad/decisions/inbox/ -->

### 2026-02-27: PRD Work Decomposition
**By:** MacReady
**What:**

## Executive Summary

The PRD defines 8 functional requirements (FR1-FR8) and 9 non-functional requirements (NFR1-NFR9) for an MVP Copilot extension in BYOK mode. After reviewing `src/extension.ts`, `src/copilotService.ts`, `src/configuration.ts`, and `package.json`, **the core implementation is DONE**. All critical path items are complete. What remains is polish, testing, packaging validation, and documentation.

### Current State: Core Functionality Complete

The codebase implements:
- **FR1 (Chat Participant)**: ✅ `package.json` lines 24-31 register `enclave.copilot` participant with `isSticky: true`, `extension.ts` lines 11-14 create participant with `hubot` icon
- **FR2 (Client Lifecycle)**: ✅ `copilotService.ts` lines 18-53 lazy-create `CopilotClient`, call `start()`, handle `cliPath` config, cleanup in `stopClient()` (lines 86-95)
- **FR3 (BYOK Session)**: ✅ `copilotService.ts` lines 55-80 create session with correct BYOK config: `type: "openai"`, `baseUrl`, `apiKey`, `wireApi`, `model`, `streaming: true`, `availableTools: []`
- **FR4 (Streaming)**: ✅ `extension.ts` lines 87-129 subscribe to `assistant.message_delta`, write to `stream.markdown()`, handle `session.idle` and `session.error`
- **FR5 (Session Reuse)**: ✅ `copilotService.ts` line 9 `Map<string, CopilotSession>`, lines 59-62 return existing session if found, `extension.ts` lines 79-85 derive conversation ID from `ChatContext.id`
- **FR6 (Configuration)**: ✅ `package.json` lines 36-64 contribute all 5 required settings, `configuration.ts` lines 16-25 read them, lines 27-49 validate required fields
- **FR7 (Error Handling)**: ✅ `extension.ts` lines 30-43 display config errors with button to settings, lines 48-58 catch `CopilotCliNotFoundError` with actionable message, lines 60-66 wire cancellation token to `session.abort()`, lines 68-76 catch and display errors in chat stream
- **FR8 (Packaging)**: ✅ `package.json` lines 77-82 define `build` and `package` scripts, esbuild config exists, SDK is bundled

### Risks Identified

1. **SDK Type Safety**: `copilotService.ts` uses `any` types (lines 4-6, 90) because `@github/copilot-sdk` is Technical Preview and may not export TypeScript types. Acceptable for MVP but should be revisited when SDK stabilizes.
2. **Event Listener Cleanup**: `extension.ts` lines 103-120 has defensive cleanup logic with `session.off` fallback to `session.removeListener`. This suggests uncertainty about SDK event emitter API. Works but brittle.
3. **No E2E Test**: No test suite exists. Manual testing is the only validation path per SC1-SC7.
4. **CLI Binary Not Bundled**: Per FR8, CLI must be pre-installed. Documentation gap — no README or setup guide for end users.

---

## Work Item Table

### Core Functionality

| # | Work Item | Owner | Priority | Status | Dependencies | Notes |
|---|-----------|-------|----------|--------|--------------|-------|
| CF-1 | Chat Participant Registration (FR1) | MacReady | P0 | ✅ Done | - | `package.json` lines 24-31, `extension.ts` lines 11-14 |
| CF-2 | CopilotClient Lifecycle (FR2) | MacReady | P0 | ✅ Done | - | `copilotService.ts` lines 18-53, 86-95; lazy init, cliPath support, graceful stop |
| CF-3 | BYOK Session Creation (FR3) | MacReady | P0 | ✅ Done | CF-2 | `copilotService.ts` lines 55-80; all params correct per PRD Table FR3 |
| CF-4 | Streaming Response Rendering (FR4) | MacReady | P0 | ✅ Done | CF-3 | `extension.ts` lines 87-129; `assistant.message_delta` → `stream.markdown()` |
| CF-5 | Session Reuse Within Conversation (FR5) | MacReady | P0 | ✅ Done | CF-3 | `copilotService.ts` Map at line 9, conversation ID from context at `extension.ts` lines 79-85 |
| CF-6 | Configuration Settings Schema (FR6) | MacReady | P0 | ✅ Done | - | `package.json` lines 36-64 contribute all 5 settings; `configuration.ts` reads/validates |

### Error Handling

| # | Work Item | Owner | Priority | Status | Dependencies | Notes |
|---|-----------|-------|----------|--------|--------------|-------|
| EH-1 | Missing Config Error Messages (FR7) | MacReady | P0 | ✅ Done | CF-6 | `extension.ts` lines 30-43; displays errors + settings button |
| EH-2 | Copilot CLI Not Found Error (FR7) | MacReady | P0 | ✅ Done | CF-2 | `copilotService.ts` lines 40-48 detect CLI missing; `extension.ts` lines 51-52 display message |
| EH-3 | Network/Auth Error Display (FR7) | MacReady | P0 | ✅ Done | CF-4 | `extension.ts` lines 111-124 handle `session.error`, lines 68-73 catch exceptions |
| EH-4 | User Cancellation Support (FR7) | MacReady | P0 | ✅ Done | CF-4 | `extension.ts` lines 60-66 wire VS Code cancellation token to `session.abort()` |

### Testing

| # | Work Item | Owner | Priority | Status | Dependencies | Notes |
|---|-----------|-------|----------|--------|--------------|-------|
| T-1 | Manual E2E Test: Happy Path (SC1) | Blair | P0 | ❌ Not started | All CF-* | Open chat, send prompt, verify streaming response |
| T-2 | Manual Test: Air-Gap Validation (SC2, SC3) | Blair | P0 | ❌ Not started | T-1 | Test with network disconnected, no GitHub token, inspect traffic |
| T-3 | Manual Test: Multi-Turn Context (SC4) | Blair | P0 | ❌ Not started | T-1 | Ask follow-up question that references prior response |
| T-4 | Manual Test: Error Scenarios (SC5) | Blair | P0 | ❌ Not started | All EH-* | Test bad endpoint, invalid key, CLI not found, verify chat panel errors |
| T-5 | Manual Test: Streaming Smoothness (SC7) | Blair | P1 | ❌ Not started | T-1 | Observe token-by-token rendering in chat panel |

### Packaging

| # | Work Item | Owner | Priority | Status | Dependencies | Notes |
|---|-----------|-------|----------|--------|--------------|-------|
| P-1 | Build Script Validation | Windows | P0 | ❌ Not started | - | Run `npm run build`, verify `dist/extension.js` created and SDK bundled |
| P-2 | VSIX Packaging Test (SC6) | Windows | P0 | ❌ Not started | P-1 | Run `npm run package`, verify `.vsix` size < 10MB (NFR8), check no external deps |
| P-3 | Sideload Test on Clean VS Code (SC6) | Windows | P0 | ❌ Not started | P-2 | Install `.vsix` on separate machine, verify activation |
| P-4 | CLI Binary Installation Documentation | Childs | P1 | ❌ Not started | - | Add README section: "Prerequisites — Copilot CLI v0.0.418+ must be on PATH" |
| P-5 | Configuration Guide | Childs | P1 | ❌ Not started | - | Document how to set `enclave.copilot.*` settings in VS Code |
| P-6 | Air-Gap Distribution Guide | Childs | P2 | ❌ Not started | P-4, P-5 | Document transferring `.vsix` + CLI binary to air-gapped machine |

### Quality & Hardening

| # | Work Item | Owner | Priority | Status | Dependencies | Notes |
|---|-----------|-------|----------|--------|--------------|-------|
| Q-1 | SDK Type Definitions Research | Blair | P2 | ❌ Not started | - | Check if `@github/copilot-sdk` exports TS types; replace `any` if available |
| Q-2 | Linting Pass | Blair | P1 | ❌ Not started | - | Run `npm run lint`, fix any new errors (currently uses `eslint-disable` at lines 89, 3-6 in copilotService.ts) |
| Q-3 | Session Cleanup on Chat Panel Close | MacReady | P2 | ❌ Not started | - | VS Code may not notify when chat is closed; investigate if `removeSession()` should be called proactively |

---

## Open Questions & Risks

1. **Q: Does the current conversation ID derivation work correctly?**
   - `extension.ts` lines 79-85 cast `ChatContext` to `{ id?: unknown }` and read `id`. The API docs don't guarantee this field exists. If VS Code doesn't provide `context.id`, we generate a fallback ID — but this breaks session reuse if the context changes. Need to test with real VS Code 1.93+ to confirm behavior.

2. **Q: What's the actual event emitter interface for CopilotSession?**
   - `extension.ts` lines 103-120 use both `session.off()` and `session.removeListener()` as fallbacks. This implies the SDK docs are unclear or the API is unstable. Should verify with SDK 0.1.26 docs or source code.

3. **Risk: No validation that Azure AI Foundry endpoint is OpenAI-compatible**
   - `copilotService.ts` line 69 hardcodes `type: "openai"`. If Azure AI Foundry uses a different API format, this will fail. The PRD assumes OpenAI compatibility but doesn't confirm. Should be tested in T-2.

4. **Risk: API key stored as plain string in settings**
   - `package.json` line 41 defines `apiKey` as plain string. PRD mentions "users should use VS Code's secret storage in production" but doesn't implement it. Acceptable for MVP but should be documented as a limitation.

5. **Risk: No session timeout or cleanup**
   - Sessions are stored indefinitely in `copilotService.ts` line 9 Map. If a user creates many conversations, memory may grow unbounded. Not a P0 issue for MVP but should be noted.

---

## Recommendations

1. **Proceed directly to testing phase** — all core code is complete. The next blocker is validating the implementation works end-to-end.
2. **Blair owns manual testing** — Use a real Azure AI Foundry endpoint (or a mock OpenAI-compatible server) to execute SC1-SC7.
3. **Windows owns packaging validation** — Confirm the build pipeline produces a valid `.vsix` that meets NFR8 (< 10MB).
4. **Childs writes README** — Users need setup instructions before the PoC can be distributed.
5. **Defer Q-1, Q-3 to post-MVP** — Type safety and session cleanup are polish items, not blockers.

**Why:** Baseline work plan for the Enclave MVP
# PRD Decomposition Decision

**Date:** 2026-02-27 (Evening)  
**Author:** MacReady  
**Context:** Rob Pitcher requested decomposition of PRD into GitHub issues/work items

---

## Decision

The Enclave MVP has been decomposed into **28 work items** organized by dependency and priority:

- **Issues 1–23**: MVP scope (scaffolding, core functionality, testing, packaging, documentation, quality polish)
- **Issues 24–28**: Post-MVP roadmap (Phase 2–6, reference only — not actionable in MVP)

Work is ordered by dependency chain: scaffolding → core → test → package → docs.

**Critical Path (Blocking):**
1. Issue 1 (Scaffolding)
2. Issues 2–5 (Chat Participant, Client, BYOK, Settings)
3. Issues 6–8 (Streaming, Error Handling, Cancellation)
4. Issues 9–12 (Testing)
5. Issues 14–16 (Build, Package, Sideload)

**Supporting Path (Parallel):**
- Issues 17–19 (Documentation) can start after Issues 2–8 are stable
- Issues 20–23 (Polish) are optional P2; can be deferred or done in parallel

---

## Rationale

### Right-Sized Issues
Each issue is scoped for **one squad member, one session**. This avoids:
- Micro-granularity (e.g., "add import statement")
- Macro-granularity (e.g., "build the extension")
- Dependency creep (e.g., one issue blocking 5 others)

### Respect PRD & Non-Goals
- **Goals G1–G7, FR1–FR8, SC1–SC7** are fully covered as Issues 2–8 (functionality) and 9–16 (validation).
- **Non-Goals NG1–NG10** are explicitly OUT of scope (no inline completions, no custom tools, no slash commands, etc.).
- Deferred features (Managed Identity, tools, Phase 2–6 roadmap) are listed as P2 or post-MVP to avoid scope creep.

### No Automated Tests for MVP
The PRD and existing decisions confirm that manual E2E testing (SC1–SC7) is the validation path. No unit test suite is required for MVP. This is consistent with the PoC nature of the work.

### Dependency Graph
Issues are ordered so that:
- Foundational work (scaffolding, settings schema) is P0-blocking
- Core implementation (client, BYOK, streaming) depends on foundation
- Testing depends on core implementation
- Packaging depends on build output
- Documentation depends on working code and packaging

### Risk Ownership
Known risks are explicitly listed as issues or documented in decisions:
- **Conversation ID derivation** (Issue 23, P2): VS Code API uncertainty → defer investigation, but flag for future hardening
- **Type safety** (Issue 20, P2): SDK is Technical Preview → use `any` for now, revisit when SDK stabilizes
- **Session cleanup** (Issue 22, P2): No immediate risk for PoC, but design should be sound for Phase 2
- **API key storage** (documented): Plain string is acceptable for MVP; SecretStorage is Phase 3 (Managed Identity support)
- **CLI bundling** (documented): Deferred to Phase 5; users install manually for MVP

### Squad Routing
- **Windows**: Build pipeline (Issues 1, 14–16), testing (9–10, 13)
- **Blair**: Core implementation (Issues 2–8), feature testing (11–12), linting (21), type safety (20)
- **Childs**: Settings & configuration (5), documentation (17–19), post-MVP features (25, 28)

---

## What This Enables

1. **Traceability**: Each PRD requirement maps to one or more work items.
2. **Parallelization**: Windows, Blair, Childs can work in parallel on independent issues (with dependency ordering).
3. **Progress Tracking**: Each issue has clear acceptance criteria and dependencies; can be tracked in GitHub Projects.
4. **Scope Control**: P2 and post-MVP items are clearly deferred; cannot be added to MVP without explicit re-prioritization.
5. **Confidence**: Core code is already complete (per existing decisions); remaining work is validation, packaging, and documentation.

---

## What Is Explicitly Deferred

| Feature | Reason | Phase |
|---------|--------|-------|
| Automated tests | PRD & decisions: manual E2E sufficient for PoC | MVP (manual), Phase 2+ (automated) |
| Azure Managed Identity | API key is sufficient; SecretStorage is complex | Phase 3 |
| Copilot CLI bundling | Licensing & complexity; users install manually | Phase 5 |
| Built-in tools (file, git) | Security surface; `availableTools: []` for MVP | Phase 2 |
| Slash commands | Not in MVP scope | Phase 4 |
| `@workspace` context | Not in MVP scope | Phase 2 |
| Conversation history | Not in MVP scope | Phase 4 |
| Multi-model endpoints | Single endpoint only | Phase 6 |
| VS Code for Web support | Desktop only | Post-MVP investigation |

---

## Next Steps

1. **Scribe**: Merge this decision into `.squad/decisions.md` (append-only)
2. **Windows**: Start Issue 1 (scaffolding validation)
3. **Blair**: Start Issue 2 (chat participant) — dependent on Issue 1 ready
4. **Childs**: Start Issue 5 (settings schema) — can run in parallel after scaffolding
5. **Squad**: Plan daily standup to sync on blockers and handoffs

---

## References

- PRD: `specs/PRD-airgapped-copilot-vscode-extension.md`
- Existing decisions: `.squad/decisions.md` (dated 2026-02-27)
- Project context: `.squad/agents/macready/history.md`
- Team roster: `.squad/team.md`
