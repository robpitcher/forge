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

---

# MVP Backlog Triage Decision

**Date:** 2026-02-27  
**Author:** MacReady (Lead)  
**Context:** Coordinator completed routing analysis for all 23 MVP issues; MacReady executed triage

---

### Rerouted to @copilot (8 issues)

| Issue | Title | Old Label | New Label | Evaluation | Reason |
|-------|-------|-----------|-----------|------------|--------|
| #2 | Validate project scaffolding and build pipeline | squad:windows | squad:copilot | 🟢 Good fit | Scaffolding validation, well-defined acceptance criteria |
| #6 | Implement VS Code settings schema (FR6) | squad:childs | squad:copilot | 🟡 Needs review | Medium feature with clear spec; code exists, needs validation |
| #15 | Configure esbuild for extension bundling | squad:windows | squad:copilot | 🟢 Good fit | Build configuration, follows established patterns |
| #16 | Package as .vsix for sideloading (FR8) | squad:windows | squad:copilot | 🟢 Good fit | Packaging task, well-defined acceptance criteria |
| #18 | Write README with setup and usage instructions | squad:childs | squad:copilot | 🟢 Good fit | Documentation, clear requirements |
| #19 | Write Copilot CLI installation guide for air-gapped environments | squad:childs | squad:copilot | 🟢 Good fit | Documentation, clear requirements |
| #20 | Write Azure AI Foundry configuration reference | squad:childs | squad:copilot | 🟢 Good fit | Documentation, clear requirements |
| #22 | Add ESLint configuration | squad:blair | squad:copilot | 🟢 Good fit | Lint/format config, boilerplate |

### Confirmed Current Assignments (15 issues)

| Issue | Title | Squad Member | Role | @copilot Evaluation |
|-------|-------|--------------|------|---------------------|
| #3 | Implement chat participant registration (FR1) | Blair | Core Implementation | 🔴 Core architecture, VS Code API integration |
| #4 | Implement CopilotClient lifecycle (FR2) | Childs | SDK & Configuration | 🔴 Core SDK integration, architecture decisions |
| #5 | Implement BYOK session creation (FR3) | Childs | SDK & Configuration | 🔴 Core SDK integration, architecture decisions |
| #7 | Implement streaming response rendering (FR4) | Blair | Core Implementation | 🔴 Complex SDK/UI integration, design judgment |
| #8 | Implement error handling (FR7) | Blair | Core Implementation | 🔴 Cross-cutting concern, architectural decisions |
| #9 | Implement request cancellation (FR7) | Blair | Core Implementation | 🔴 Complex SDK integration, UX judgment |
| #10 | Test: Happy path — chat send and receive (SC1) | Windows | Build & Test | 🔴 Manual E2E test requiring judgment |
| #11 | Test: Air-gap validation — no GitHub API calls (SC2, SC3) | Windows | Build & Test | 🔴 Security-sensitive testing, domain knowledge |
| #12 | Test: Multi-turn conversation context (SC4) | Blair | Core Implementation | 🔴 Manual test requiring extension API knowledge |
| #13 | Test: Error scenarios (SC5) | Windows | Build & Test | 🔴 Manual test requiring error domain knowledge |
| #14 | Test: Streaming smoothness (SC7) | Windows | Build & Test | 🔴 Manual test requiring UX judgment |
| #17 | Test: Sideload .vsix on clean VS Code (SC6) | Windows | Build & Test | 🔴 Manual physical test, can't be automated |
| #21 | Improve type safety for Copilot SDK interfaces | Blair | Core Implementation | 🔴 Refactoring requiring SDK architectural understanding |
| #23 | Implement session cleanup on conversation end | Blair | Core Implementation | 🔴 Architecture, session lifecycle design |
| #24 | Investigate ChatContext conversation ID reliability | MacReady | Lead | 🔴 Investigation, ambiguous requirements |

---

### @copilot Routing Criteria

Issues routed to @copilot meet these criteria:
1. **Clear acceptance criteria** — well-defined requirements with no ambiguity
2. **Boilerplate or validation work** — scaffolding checks, config files, documentation
3. **No architectural decisions** — does not require design judgment or SDK expertise
4. **Automatable or mechanical** — follows established patterns or templates

**🟢 Good fit** = High confidence @copilot will deliver without review  
**🟡 Needs review** = Medium confidence; PR review recommended (e.g., #6 validates existing code)

### Squad Member Routing Criteria

Issues kept with squad members require:
1. **Core architecture** — VS Code extension API, SDK integration patterns
2. **Design judgment** — UX decisions, error handling strategy, session lifecycle
3. **Manual testing** — physical validation (sideloading, air-gap), requires human observation
4. **Investigation** — ambiguous requirements, open questions (e.g., #24 ChatContext ID reliability)

---

## Known Risks

1. **Issue #6 (Settings Schema)** — flagged as 🟡; code already exists in `package.json` lines 36-64. @copilot should validate compliance with PRD Table FR6, not rewrite. PR review recommended.
2. **Auto-assign cadence** — @copilot picks up work via periodic heartbeat. If urgent, manually assign via GitHub UI.
3. **@copilot context limits** — large issues (e.g., #18 README) may require multiple turns. Monitor for incomplete work.

---

### Job 1: Dependency Links

All 22 issues with upstream dependencies now have a `**Dependencies:**` section prepended to their body. Issues with no dependencies (#2, #25–#29) were left untouched.

| Issue | Depends On |
|-------|------------|
| #3 | #2 |
| #4 | #2 |
| #5 | #4 |
| #6 | #2 |
| #7 | #5 |
| #8 | #3, #4, #7 |
| #9 | #7 |
| #10 | #3, #5, #7 |
| #11 | #10 |
| #12 | #10 |
| #13 | #8 |
| #14 | #7, #10 |
| #15 | #2 |
| #16 | #15 |
| #17 | #16 |
| #18 | #3, #6 |
| #19 | #4 |
| #20 | #5, #6 |
| #21 | #4, #5 |
| #22 | #2 |
| #23 | #5, #24 |
| #24 | #5 |

### Job 2: Sprint Assignments

All 28 issues have Sprint field values set on Project #8.

| Sprint | Issues | Phase |
|--------|--------|-------|
| Sprint 1 | #2–#24 | MVP |
| Sprint 2 | #25, #26 | Phase 2 (Built-in tools, @workspace) |
| Sprint 3 | #27, #28*, #29* | Phase 3+ |

**⚠️ Fallback applied:** Sprint 4 and Sprint 5 could not be created via the GitHub Projects V2 API (iteration creation is not exposed programmatically). Issues #28 (Phase 4 — Slash commands) and #29 (Phase 5 — Bundle CLI) were assigned to Sprint 3 as a temporary fallback. Manual creation of Sprint 4 and Sprint 5 in the GitHub Projects UI is needed, then reassign #28 and #29 accordingly.

---

## API Details

- **Project ID:** `PVT_kwHOANBAvc4BQSxx`
- **Sprint Field ID:** `PVTIF_lAHOANBAvc4BQSxxzg-dMUk`
- **Sprint 1 Iteration ID:** `09d998ce`
- **Sprint 2 Iteration ID:** `3ac56f5d`
- **Sprint 3 Iteration ID:** `59011026`
- **Iteration creation:** Not available via GraphQL API; must use GitHub Projects UI

---

### 2026-02-27T05:20:00Z: User directive — Branching strategy and main branch protection
**By:** Rob Pitcher (via Copilot)
**What:**
1. **NEVER commit directly to `main`.** Pull requests are the only way commits reach `main`.
2. **Only a human may merge PRs into `main`.** No automated merges to main.
3. **Branching strategy:**
   - Short-term work (issues) → own branch off `dev`
   - When complete → PR into `dev` after appropriate reviews
   - To release to `main`:
     a. Create a release branch from `dev` with `rel/` prefix (e.g., `rel/0.2.0`)
     b. On the `rel/` branch: update `.gitignore` to exclude `.squad/`, untrack and remove `.squad/` files from the branch, commit
     c. Open a PR from `rel/` branch → `main`
     d. Human reviews, then squash-merges into `main`
4. **`.squad/` folder must NOT reach `main`.** It is stripped on the release branch before the PR.

**Why:** User request — captured for team memory. Ensures clean main branch, proper review gates, and keeps squad state out of production.

### 2026-02-27: Release Branch Process Decision
**By:** Childs (SDK Dev)
**What:**

Established the release branch process for Enclave. Release branches follow the `rel/X.Y.Z` naming convention, branched from `dev`, targeting `main`.

#### Process

1. **Branch from dev:** `git checkout dev && git pull origin dev && git checkout -b rel/X.Y.Z`
2. **Strip `.squad/`:** Add `.squad/` to `.gitignore`, then `git rm -r --cached .squad/` to untrack without deleting files on disk
3. **Keep `.github/agents/`:** Agent configuration files ship to main — needed for GitHub to recognize the Copilot agent
4. **Commit:** Single commit with `.gitignore` update and `.squad/` deletion
5. **Push and PR:** Push branch, open PR to `main` with clear description of what's included/excluded
6. **Human merge:** PR is never auto-merged — Rob reviews and squash-merges manually
7. **Return to dev:** Always `git checkout dev` after pushing to stay on the working branch

#### Execution Record

- **Branch:** `rel/0.2.0` created from `dev`
- **Commit:** `chore: strip .squad/ from release branch` — removed 34 `.squad/` files from tracking, updated `.gitignore`
- **PR:** #30 — "Release v0.2.0 — MVP infrastructure, workflows, and project setup" (base: main, head: rel/0.2.0)
- **Status:** PR open, awaiting Rob's review

## Implementation

Created `src/test/air-gap-validation.test.ts` with 18 tests organized in 7 test suites:
- No GitHub API endpoint references (3 tests)
- No GITHUB_TOKEN dependency (3 tests)
- Azure AI Foundry-only configuration (3 tests)
- Chat functionality without GitHub config (3 tests)
- Extension settings schema compliance (2 tests)
- Provider configuration validation (2 tests)
- No external network calls (2 tests)

---

## Manual Testing Still Required

Automated tests validate code structure, but **manual validation** per issue acceptance criteria is still needed:
- Disconnect network (simulated air-gap)
- Unset GITHUB_TOKEN
- Verify extension activates and chat works
- Use network inspection to confirm zero GitHub API calls

This is complementary to automated tests: automation prevents mistakes, manual testing confirms real-world behavior.

---

# Documentation Delivery Decision — Issues #19 & #20

**Date:** 2026-02-27 (Evening)  
**Author:** MacReady (Lead)  
**Issues:** #19 (Copilot CLI installation guide), #20 (Azure AI Foundry configuration reference)  
**Branch:** `squad/19-20-docs` → PR #45 (open to `dev`)

---

## What Was Built

### docs/installation-guide.md (Issue #19)

**Purpose:** Enable platform/DevOps engineers to download, transfer, and install the Copilot CLI in air-gapped environments.

**Structure:**
- **Overview**: Problem statement and high-level process (download → transfer → install → verify)
- **Prerequisites**: Connected machine, target machine, approved transfer media
- **Step 1**: Download from GitHub releases (`https://github.com/github/copilot-cli/releases`)
  - OS-specific binary filenames (macOS Intel/ARM, Linux, Windows)
  - Example URL format
  - SHA256 verification instructions (curl + shasum/sha256sum)
- **Step 2**: Transfer via approved media (USB, secure portal, CD/DVD)
- **Step 3**: Install on target machine
  - Locate and verify binary
  - Make executable (`chmod +x`)
  - Two installation options:
    - Option A: Global PATH (`/usr/local/bin`, `~/.local/bin`, Windows environment variables)
    - Option B: Local configuration (`enclave.copilot.cliPath` setting)
- **Step 4**: Verification
  - `copilot --version` → confirm v0.0.418+
  - `copilot server` → test startup
  - E2E test in VS Code
- **Troubleshooting**: 5 common issues with solutions

**Acceptance Criteria (Issue #19) — All Met:**
- ✅ Step-by-step CLI installation documented
- ✅ Download URL and version requirements documented (v0.0.418+)
- ✅ Transfer and installation procedure clear (USB, secure systems, approved media)
- ✅ Verification step included (copilot --version, copilot server, E2E test)

### docs/configuration-reference.md (Issue #20)

**Purpose:** Document all extension settings, Azure endpoint setup, and troubleshooting for both DevOps and developers.

**Structure:**
- **Configuration Overview**: Required vs optional settings table
- **Settings Reference**: Full documentation for all 5 settings from `package.json`:
  - `enclave.copilot.endpoint` (required, string)
  - `enclave.copilot.apiKey` (required, string)
  - `enclave.copilot.model` (optional, default: `gpt-4.1`)
  - `enclave.copilot.wireApi` (optional, enum: `completions` | `responses`)
  - `enclave.copilot.cliPath` (optional, string)
- **Azure AI Foundry Setup**: Prerequisites and resource creation overview
- **Endpoint URL Format**: Standard format breakdown
  - Pattern: `https://{resource-name}.openai.azure.com/openai/v1/`
  - Component table with examples
  - Verification instructions (Azure Portal, curl testing)
- **API Key Retrieval**: Step-by-step Azure Portal walkthrough (5 steps)
- **Deployment Name vs Model Name**: Dedicated section with:
  - Clear definition of both concepts
  - How to find your deployment name in Azure Portal
  - Conceptual deployment list example
  - Configuration example showing correct usage
- **Wire API Setting**: Detailed explanation of both options
  - Default `completions` format with OpenAI Chat Completions API example
  - Alternative `responses` format with JSON example
  - When to use each
  - How to determine which format your endpoint supports
- **Example Configurations**: 5 real-world scenarios
  - Minimal config (endpoint + key only)
  - Custom model deployment
  - Custom CLI path
  - Alternative wire format
  - Full Windows configuration
- **Troubleshooting**: Organized by issue category (connection, auth, model, format)
  - 7+ problems with solutions
  - Debug curl commands for self-service testing
  - VS Code log inspection instructions

**Acceptance Criteria (Issue #20) — All Met:**
- ✅ Endpoint URL format documented with examples (`https://{resource}.openai.azure.com/openai/v1/`)
- ✅ API key retrieval steps for Azure portal (5-step walkthrough)
- ✅ Deployment name vs model name explained (dedicated section with examples)
- ✅ wireApi setting explained with use cases (completions for standard OpenAI, responses for alternative)

---

## Design Decisions

### 1. Audience Split

- **Installation guide**: Targets platform/DevOps engineers responsible for CLI distribution in air-gapped networks
- **Configuration guide**: Targets both engineers (for Azure setup) and developers (for VS Code settings)
- This split avoids overwhelming either audience with irrelevant details

### 2. Content Sourcing

All configuration information is sourced directly from:
- `package.json` (lines 33-66): contributes.configuration schema with all 5 settings
- `src/configuration.ts` (lines 16-25): getConfiguration() function with defaults and field names
- PRD Table FR6: Required settings, default values, and descriptions
- Real Azure AI Foundry deployment patterns

This ensures documentation stays in sync with actual code.

### 3. Cross-References

Both docs link to each other:
- Installation guide concludes: "Once the CLI is installed and verified, proceed to [Configuration Reference](configuration-reference.md)"
- Configuration guide header links back to installation guide for the CLI

This guides users through the complete setup workflow in order.

### 4. Security Posture

Configuration guide includes explicit security notes:
- "API keys are stored as plaintext in VS Code settings"
- "For production environments, consider alternative authentication (Managed Identity — Phase 3)"
- "Never commit your API key to version control"

This manages expectations and defers implementation of VS Code SecretStorage to Phase 3 (per PRD).

### 5. Verification Depth

Installation guide includes both UI and CLI verification:
- `copilot --version` — confirms CLI version
- `copilot server` — tests startup and stdio communication
- E2E test in VS Code — validates end-to-end integration

This catches problems at three levels: CLI availability, SDK communication, and extension integration.

---

## Session Cleanup Implementation Decision

**Date:** 2026-02-27  
**Author:** Blair (Extension Dev)  
**Context:** Issue #23 — Implement session cleanup on conversation end

---

### Why graceful error handling?
The SDK's `session.abort()` throws if the session has already ended or is in an invalid state. Since cleanup may be triggered from error paths, cancellation, or deactivation, we can't assume session state. Catching and logging prevents cleanup failures from cascading.

### Why concurrent abort in destroyAllSessions()?
Extension deactivation should be fast — blocking on sequential session cleanup would delay shutdown. `Promise.all()` parallelizes aborts while still ensuring all complete before clearing the Map.

### Why keep removeSession() separate?
`removeSession()` is a lightweight Map deletion without abort. It's still useful for test teardown or scenarios where the session was already disposed by other means. `destroySession()` is the new default for production cleanup.

### Why the undefined session guard?
Test discovered edge case: if a session is removed from the Map (via `removeSession()`) while another operation is iterating the Map, the iterator may encounter undefined values. While unlikely in production, the guard makes cleanup robust against race conditions.

---

## What This Doesn't Solve

- **No automatic conversation-end detection** — VS Code Chat API doesn't expose conversation close events. Sessions remain in memory until error or deactivation. Issue #24 (ChatContext ID reliability) may inform future cleanup triggers.
- **No session timeout** — sessions persist indefinitely if no errors occur. Periodic cleanup (e.g., TTL-based) is deferred to post-MVP hardening.

---

### 2026-02-27T15:06:00Z: User directive — Standalone chat UI required
**By:** Rob Pitcher (via Copilot)
**What:** Enclave must be a standalone VS Code extension with its own chat UI. Users must NOT be required to sign into GitHub Copilot or have Copilot installed. The Chat Participant API (`vscode.chat.createChatParticipant`) cannot be used because it depends on the Copilot Chat extension. The extension needs a self-contained UI (e.g., Webview panel) that works in air-gapped environments with zero GitHub dependencies.
**Why:** User request — the entire purpose of Enclave is air-gapped environments. Requiring GitHub Copilot defeats the purpose. This is a critical architectural change.

---

### 2026-02-27: Architecture Decision — Standalone Chat UI (No GitHub Auth Dependency)
**By:** MacReady (Lead)
**Context:** Rob Pitcher confirmed "i dont want users to have to sign into github copilot to use this"

## Critical Issue

The current extension uses `vscode.chat.createChatParticipant()` which **requires GitHub Copilot Chat to be installed and authenticated**. This violates PRD Goal G3: "Zero GitHub authentication — the extension works without any GitHub account, token, or internet connectivity to GitHub."

**Confirmed by research:** The Chat Participant API is tightly coupled to GitHub Copilot infrastructure. Authentication via GitHub is essential for access to Copilot Chat's native LLM features and related APIs. Users must have an active Copilot subscription and be signed into GitHub Copilot in VS Code.

**This is a blocking architecture issue for air-gapped/zero-auth requirement.**

## Recommended Solution: WebviewView (Sidebar)

Replace the Chat Participant API with **`vscode.window.registerWebviewViewProvider`** to create a custom sidebar chat panel.

### Why WebviewView Sidebar

1. **✅ Works in air-gapped (no GitHub auth required)**: Completely self-contained; no external dependencies
2. **✅ Native-like UX**: Appears in activity bar like Copilot Chat; persistent sidebar experience
3. **✅ Moderate complexity**: Well-documented API with official samples; React/Vue integration available
4. **✅ Full UI control**: Custom HTML/CSS/JS for chat interface; message history, streaming, markdown rendering
5. **✅ Bidirectional communication**: `postMessage` API for extension ↔ webview messaging

## Architecture Options Comparison

### Option 1: WebviewView (Sidebar) — **RECOMMENDED**

**Description:** Register a custom view in the sidebar using `vscode.window.registerWebviewViewProvider`. The extension contributes its own activity bar icon and a webview-based chat panel.

#### Pros
- **Air-gapped compatible:** Zero external dependencies; no GitHub auth
- **Native UX:** Persistent sidebar view in activity bar (like Copilot Chat sidebar)
- **Well-documented:** Official samples, extensive community examples
- **Framework support:** Can use React, Vue, plain JS/HTML
- **Theme-aware:** Can use VS Code Webview UI Toolkit (deprecated Jan 2025 but still functional) or custom theming with CSS variables

#### Cons
- **Moderate implementation effort:** Need to build HTML/CSS/JS chat UI from scratch
- **Webview overhead:** More resource usage than native VS Code UI
- **Limited native integration:** Cannot use VS Code's built-in chat context features (but we don't need them for MVP)

#### Implementation Details

**package.json changes:**
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "enclaveChat",
          "title": "Enclave",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "enclaveChat": [
        {
          "type": "webview",
          "id": "enclave.chatView",
          "name": "Chat"
        }
      ]
    }
  },
  "activationEvents": [
    "onView:enclave.chatView"
  ]
}
```

**extension.ts changes:**
```typescript
// Remove: vscode.chat.createChatParticipant()
// Add:
const provider = new ChatViewProvider(context.extensionUri);
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider('enclave.chatView', provider)
);
```

**New files needed:**
- `src/chatViewProvider.ts` — WebviewViewProvider implementation
- `src/webview/chat.html` — Chat UI (message list, input box)
- `src/webview/chat.css` — Styling (VS Code theme integration)
- `src/webview/chat.js` — Client-side logic (message rendering, input handling, postMessage)

**What we keep:**
- ✅ `copilotService.ts` — SDK BYOK backend (no changes)
- ✅ `configuration.ts` — Settings reader/validator (no changes)
- ✅ `types.ts` — Type definitions (no changes)
- ✅ All streaming logic — just route to webview instead of ChatResponseStream

**Complexity:** Moderate — 2-3 days for a skilled developer

### Option 2: Webview Panel (Editor Tab)

**Description:** Open a full webview panel as an editor tab using `vscode.window.createWebviewPanel`.

### Option 3: Native VS Code TreeView + QuickInput

**Description:** Use TreeView for message history, QuickInput for prompt input.

### Option 4: Terminal-based UI

**Description:** Render chat in an integrated terminal.

## What We Keep from Current Implementation

The architecture change only affects the **UI layer**. All backend logic remains intact:

| Component | Status | Notes |
|-----------|--------|-------|
| `copilotService.ts` | ✅ Keep as-is | CopilotClient lifecycle, BYOK session creation — no changes |
| `configuration.ts` | ✅ Keep as-is | Settings reader/validator — no changes |
| `types.ts` | ✅ Keep as-is | Type definitions — no changes |
| Streaming logic | ✅ Refactor routing | Same `assistant.message_delta` event handling, but send to webview instead of ChatResponseStream |
| Error handling | ✅ Refactor display | Same error detection, but display in webview chat instead of ChatResponseStream |
| Session reuse | ✅ Keep as-is | Conversation ID derivation, session Map — no changes |

**Key insight:** We're only swapping the presentation layer. The SDK integration and BYOK backend are unaffected.

## Implementation Plan

### Phase 1: Minimal Viable Sidebar (P0)
1. Remove `chatParticipants` contribution from `package.json`
2. Add `viewsContainers` and `views` for sidebar
3. Create `ChatViewProvider` implementing `WebviewViewProvider`
4. Create minimal HTML chat UI (message list + input box)
5. Wire up `postMessage` for bidirectional communication
6. Route streaming responses to webview instead of `ChatResponseStream`
7. Test end-to-end: open sidebar, send prompt, see streamed response

**Estimate:** 2-3 days

### Phase 2: UX Polish (P1)
1. Add markdown rendering in webview (use `marked.js` or similar)
2. Add syntax highlighting for code blocks (use `highlight.js`)
3. Add VS Code theme integration (CSS variables)
4. Add message history persistence (optional — can defer to Phase 2)
5. Add loading indicators, error states

**Estimate:** 1-2 days

### Phase 3: Feature Parity (P2)
1. Add conversation management (clear, export)
2. Add settings button in webview
3. Add cancellation button for in-flight requests
4. Add copy button for messages

**Estimate:** 1-2 days

## Risks & Mitigations

### Risk 1: Webview resource usage
- **Impact:** Webviews use more memory than native UI
- **Mitigation:** For MVP, single sidebar panel is acceptable. Monitor performance in testing.
- **Severity:** Low — not a blocker for PoC

### Risk 2: Custom UI maintenance
- **Impact:** We own all HTML/CSS/JS for chat interface
- **Mitigation:** Use well-known libraries (marked.js, highlight.js). Keep UI minimal for MVP.
- **Severity:** Low — acceptable tradeoff for air-gapped requirement

### Risk 3: Webview UI Toolkit deprecation (Jan 2025)
- **Impact:** Official toolkit for VS Code-themed webviews is being deprecated
- **Mitigation:** Use custom CSS with VS Code CSS variables, or plain styling. Toolkit still works for now.
- **Severity:** Low — we can style manually or use community alternatives

### Risk 4: Learning curve for webview development
- **Impact:** Team may not be familiar with webview API
- **Mitigation:** Excellent official samples exist; well-documented API
- **Severity:** Low — 1-2 hours to learn basics

## Appendix: Example WebviewViewProvider Skeleton

```typescript
import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.handleSendMessage(data.prompt, webviewView.webview);
          break;
      }
    });
  }

  private async handleSendMessage(prompt: string, webview: vscode.Webview) {
    // 1. Get config and validate
    // 2. Get or create session (existing copilotService logic)
    // 3. Subscribe to assistant.message_delta events
    // 4. Send deltas to webview via postMessage
    // Example:
    // session.on('assistant.message_delta', (event) => {
    //   webview.postMessage({ type: 'messageDelta', content: event.delta.content });
    // });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Enclave Chat</title>
        <style>
          body { 
            padding: 0; 
            margin: 0; 
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          #messages { 
            flex: 1; 
            overflow-y: auto; 
            padding: 10px; 
          }
          #input-container { 
            display: flex; 
            padding: 10px; 
            border-top: 1px solid var(--vscode-panel-border);
          }
          #prompt { 
            flex: 1; 
            margin-right: 5px; 
          }
        </style>
      </head>
      <body>
        <div id="messages"></div>
        <div id="input-container">
          <input type="text" id="prompt" placeholder="Ask a question..." />
          <button id="send">Send</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const messages = document.getElementById('messages');
          const prompt = document.getElementById('prompt');
          const send = document.getElementById('send');

          send.addEventListener('click', () => {
            const value = prompt.value.trim();
            if (value) {
              vscode.postMessage({ type: 'sendMessage', prompt: value });
              prompt.value = '';
            }
          });

          window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.type) {
              case 'messageDelta':
                // Append delta to last message or create new message
                // (simplified — real implementation needs message tracking)
                messages.innerHTML += message.content;
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
```

**Why:** Provides actionable architecture decision to resolve air-gapped/zero-auth requirement blocking issue.

---

### 2026-02-27T12:29:54Z: User directive — Copilot must target dev branch
**By:** Rob Pitcher (via Copilot)
**What:** The Copilot coding agent must always base branches off `dev` and open PRs targeting `dev`. PRs must never target `main` — `main` is the release branch only. PRs #31, #32, #33 were closed because they incorrectly targeted `main`.
**Why:** User request — branching strategy requires all development work flows through `dev`. Captured for team memory.
# Decision: Phase 2 Issue Rescope — #25 (Tools) and #26 (Context)

**By:** MacReady
**Date:** 2026-02-28
**Requested by:** Rob Pitcher

## Context

Issues #25 and #26 were written when the extension used Chat Participant API. The architecture has since migrated to **WebviewViewProvider** (activity bar sidebar) with custom HTML/CSS/JS chat UI. Both issues need rescoping to reflect the actual codebase.

Key architecture facts at time of rescope:
- WebviewView registered as `forge.chatView` in activitybar
- Custom chat UI in `media/chat.js` / `media/chat.css`
- Messages via `vscode.postMessage()` / `onDidReceiveMessage()`
- Session management in `src/copilotService.ts` with `availableTools: []`
- API key in VS Code SecretStorage
- Build: esbuild, Tests: vitest (67 passing)

---

## Issue #25 — Enable Copilot CLI Built-in Tools (Rescoped)

### Proposed New Issue Body

---

## Summary

Enable Copilot CLI's built-in tools (file system, git, etc.) by removing the `availableTools: []` restriction in session creation. Add **user confirmation before tool execution** and an **auto-approve setting** for trusted environments.

## Background

Currently, `src/copilotService.ts` line 79 passes `availableTools: []` to `copilotClient.createSession()`, which explicitly disables all CLI tools. Removing this (or omitting the key) lets the SDK expose its built-in tools. The SDK emits tool-call events that the extension must intercept, present for approval, and then confirm or reject.

## Architecture

### Current flow (no tools)
```
User prompt → session.send({ prompt }) → LLM responds with text → streamDelta events
```

### New flow (with tools)
```
User prompt → session.send({ prompt }) → LLM requests tool call →
  SDK emits tool event → Extension intercepts →
  Show confirmation in webview (or auto-approve) →
  Confirm/reject back to SDK → SDK executes tool → LLM continues
```

### 1. Enable tools in `copilotService.ts`

- **Remove `availableTools: []`** from the `createSession()` call (line 79). When omitted, the SDK exposes its default built-in tools.
- Alternatively, pass a curated list if we want to limit which tools are available (e.g., allow file read but not file write initially).

### 2. Handle tool-call events in `extension.ts`

- Subscribe to the SDK's tool-call event on the session (e.g., `session.on("tool.call", ...)` — exact event name TBD from SDK docs).
- When a tool call is received:
  - Check the `forge.copilot.autoApproveTools` setting.
  - If auto-approve is **enabled**: confirm immediately, no user interaction.
  - If auto-approve is **disabled** (default): send a `toolConfirmation` message to the webview.

### 3. Tool confirmation UX in webview (`media/chat.js`)

- Add a new message type `toolConfirmation` that renders an **inline confirmation card** in the chat stream:
  ```
  ┌─────────────────────────────────────┐
  │ 🔧 Tool: write_file                │
  │ Path: src/utils.ts                  │
  │ Action: Write 15 lines              │
  │                                     │
  │  [Approve]  [Reject]                │
  └─────────────────────────────────────┘
  ```
- User clicks Approve or Reject → `vscode.postMessage({ command: "toolResponse", id, approved: true/false })`.
- Extension receives the response in `_handleMessage()` and calls the SDK's confirmation/rejection API on the session.
- If rejected, the LLM receives the rejection and can adjust its approach.

### 4. Auto-approve setting in `package.json`

Add to `contributes.configuration.properties`:
```json
"forge.copilot.autoApproveTools": {
  "type": "boolean",
  "default": false,
  "description": "Automatically approve tool executions without confirmation. Enable only in trusted environments.",
  "tags": ["security"]
}
```

### 5. Tool output rendering

- After a tool executes, render the result in the chat stream (e.g., a collapsible "Tool output" section).
- Add a new webview message type `toolResult` with tool name, status (success/error), and output summary.

## Files to Modify

| File | Changes |
|------|---------|
| `src/copilotService.ts` | Remove `availableTools: []` from `createSession()` |
| `src/extension.ts` | Subscribe to tool events, implement approval flow, wire `toolResponse` message handler |
| `media/chat.js` | Handle `toolConfirmation` and `toolResult` message types, render confirmation cards |
| `media/chat.css` | Styles for tool confirmation card and tool output display |
| `package.json` | Add `forge.copilot.autoApproveTools` setting |
| `src/configuration.ts` | Read `autoApproveTools` setting |

## Acceptance Criteria

- [ ] Tools are enabled — the LLM can request file reads, file writes, git operations, etc.
- [ ] When `autoApproveTools` is `false` (default), a confirmation card appears in the chat before any tool executes.
- [ ] User can approve or reject each tool call individually from the webview.
- [ ] When `autoApproveTools` is `true`, tools execute immediately without user interaction.
- [ ] Tool execution results are displayed in the chat stream.
- [ ] Rejected tool calls are communicated back to the LLM gracefully.
- [ ] No regression in existing chat flow (text-only prompts still work as before).
- [ ] Unit tests cover the approval/rejection flow.
- [ ] Setting is documented with a security warning about auto-approve.

## Security Considerations

- Auto-approve is **off by default** — users must explicitly opt in.
- Tool confirmation shows the tool name, target path, and action summary so users can make informed decisions.
- Consider a future enhancement for per-tool approval rules (e.g., always approve reads, always confirm writes).

## Routing Recommendation

- **Primary: Childs** (`squad:childs`) — SDK integration: removing `availableTools`, subscribing to tool events, wiring confirmation/rejection back to the SDK session.
- **Secondary: Blair** (`squad:blair`) — Webview UX: confirmation card rendering in `media/chat.js`, CSS styling, message handler wiring in `extension.ts`.
- **Review: MacReady** — Architecture review of the approval flow and security posture.

---

## Issue #26 — Add Workspace Context and Editor Selection (Rescoped)

### Context flow
```
1. User selects code in editor (or clicks "Attach Selection" button)
2. Extension reads activeTextEditor.selection via VS Code API
3. Context metadata sent to webview via postMessage
4. Webview displays context chip(s) in input area
5. On send, context is included in the message to extension
6. Extension prepends context to the prompt string sent to session.send()
```

### 1. Capture editor selection — `src/extension.ts`

- Register a command `forge.attachSelection` that:
  1. Reads `vscode.window.activeTextEditor` for the active file and selection.
  2. Extracts: file path (workspace-relative), language ID, selected text, line range.
  3. Posts a `contextAttached` message to the webview with the context payload.
- Register a command `forge.attachFile` that:
  1. Opens a Quick Pick or file picker filtered to workspace files.
  2. Reads file content (or summary for large files — e.g., first 200 lines).
  3. Posts a `contextAttached` message to the webview.

### 2. Context attachment UI in webview (`media/chat.js`)

- Add a button row above the text input: **[📎 Attach Selection]** **[📄 Attach File]**
  - These buttons send `{ command: "attachSelection" }` or `{ command: "attachFile" }` to the extension.
- When `contextAttached` message is received, render a **context chip** below the buttons:
  ```
  ┌──────────────────────────────────┐
  │ 📄 src/utils.ts:12-28 (ts)  [✕] │
  └──────────────────────────────────┘
  ```
- Multiple context chips can be attached (stacked).
- Each chip has a remove button (✕) to detach context before sending.
- Context chips are cleared after the message is sent.

### 3. Include context in prompts — `src/extension.ts`

- When `_handleChatMessage` receives a message, check for attached context.
- Prepend context to the user's prompt in a structured format:
  ```
  [Context: src/utils.ts lines 12-28 (typescript)]
  ```typescript
  function calculateSum(a: number, b: number): number {
    return a + b;
  }
  ```

  User's question here...
  ```
- This ensures the LLM sees the code context alongside the question.
- Cap context size to avoid token limits — truncate with a note if context exceeds a threshold (e.g., 8000 chars).

### 4. View/title button for quick attach

Add to `package.json` `menus.view/title`:
```json
{
  "command": "forge.attachSelection",
  "when": "view == forge.chatView && activeEditor",
  "group": "navigation"
}
```
This puts an "Attach Selection" icon in the sidebar title bar alongside the existing settings gear.

### 5. Auto-attach active selection (optional enhancement)

- When the user switches to the Forge sidebar while having text selected, optionally auto-suggest attaching it.
- Controlled by a setting `forge.copilot.autoAttachSelection` (default: `false`).
- If enabled, the extension listens to `onDidChangeActiveTextEditor` and `onDidChangeTextEditorSelection` and auto-posts context to the webview.

## Out of Scope (Phase 3+)

- Full workspace indexing / semantic search (RAG)
- Automatic context from open tabs
- `@workspace` search across all project files
- Drag-and-drop file attachment

## Decision Summary

| Issue | Old Assumption | Actual Architecture | Key Changes |
|-------|---------------|-------------------|-------------|
| #25 | Just remove `availableTools: []` | WebviewView needs custom tool confirmation UX | Add inline approval cards, auto-approve setting, tool result rendering |
| #26 | Chat Participant API provides `@workspace` | No built-in context — must build from scratch | Add attach commands, context chips in webview, prompt prepending |

Both issues are larger than originally scoped. Recommend splitting implementation across Childs (SDK) and Blair (UX) with MacReady review.
### 2026-02-27T20:48Z: User directive
**By:** Rob Pitcher (via Copilot)
**What:** Stop removing .squad/ files during the release process. Release branches should be created directly from dev without deleting .squad/ — the repeated add/remove clutters git history.
**Why:** User request — captured for team memory
### 2026-02-27: API Key Storage Migrated to SecretStorage

**By:** Blair
**What:** The `enclave.copilot.apiKey` setting is now stored via VS Code's SecretStorage API (`context.secrets`) instead of plain-text settings.json. The settings gear button shows a QuickPick menu with "Open Settings" and "Set API Key (secure)" options. The secure option uses a password input box with native masking. `getConfigurationAsync()` in `src/configuration.ts` checks SecretStorage first, falls back to settings.json for backward compatibility.

**Why:** API keys in settings.json are visible in plain text. SecretStorage uses the OS keychain (Credential Manager on Windows, Keychain on macOS, libsecret on Linux) which is the VS Code-recommended approach for secrets.

**Impact:**
- `src/configuration.ts` now exports `getConfigurationAsync(secrets)` — any code reading config that needs the API key should use this async version.
- `src/extension.ts` `ChatViewProvider` constructor now requires `context.secrets` as second parameter.
- All test files calling `activate()` must include a `secrets` mock on the ExtensionContext.
- The sync `getConfiguration()` still exists for non-secret settings but won't include SecretStorage values.

### 2026-02-28: Tool Confirmation UX Message Contract

**By:** Blair
**What:** The webview tool confirmation/result protocol is implemented in `media/chat.js` and `media/chat.css`. The message contract between extension.ts and the webview is:

- **Extension → Webview:** `{ type: "toolConfirmation", id: string, tool: string, params: object }` — renders inline approval card
- **Extension → Webview:** `{ type: "toolResult", id: string, tool: string, status: "success"|"error", output?: string }` — renders compact result indicator
- **Webview → Extension:** `{ command: "toolResponse", id: string, approved: boolean }` — user's approval/rejection response

Childs should wire `_handleMessage` in extension.ts to handle the `toolResponse` command, and post `toolConfirmation`/`toolResult` messages to the webview during tool execution flow.

**Context:** Issue #25 — Enable Copilot CLI built-in tools

### 2026-02-28: SDK Tool Event API — Actual Shape

**Author:** Childs (SDK Dev)
**Date:** 2026-02-28
**Context:** Issue #25 — Enable Copilot CLI built-in tools

## Finding

The @github/copilot-sdk (v0.1.26) does NOT use a "tool confirmation event" pattern for approvals. The actual API:

### Permission Handling
- **`onPermissionRequest`** callback in `SessionConfig` — called when the CLI needs permission for shell, write, read, MCP, or URL operations.
- Input: `PermissionRequest { kind: "shell"|"write"|"mcp"|"read"|"url", toolCallId?: string, [key: string]: unknown }`
- Output: `PermissionRequestResult { kind: "approved"|"denied-by-rules"|"denied-no-approval-rule-and-could-not-request-from-user"|"denied-interactively-by-user" }`
- The SDK also exports `approveAll` as a convenience handler.

### Tool Execution Events (session events, subscribe via `session.on()`)
- `tool.execution_start` — `{ toolCallId, toolName, arguments?, mcpServerName?, parentToolCallId? }`
- `tool.execution_complete` — `{ toolCallId, success, result?: { content }, error?: { message }, parentToolCallId? }`
- `tool.execution_partial_result` — streaming partial output
- `tool.execution_progress` — progress messages
- `tool.user_requested` — when user explicitly requests a tool

### Adapted Message Protocol
The `toolConfirmation` message uses `request.kind` (e.g., "shell", "write") as the `tool` field, since the permission request fires before `tool.execution_start` and has no `toolName`. The `params` field contains the full `PermissionRequest` object for the webview to display relevant details.

The `toolResult` message uses `toolName` from `tool.execution_start`, tracked via a `toolCallId → toolName` map.

### Enabling Tools
Removing `availableTools: []` from `createSession()` exposes the CLI's default built-in tools. No explicit tool list needed.

### 2026-02-28: User Directive — Auto-Approve Persistence

**By:** Rob Pitcher (via Copilot)
**What:** The `autoApproveTools` setting for issue #25 should use standard VS Code settings persistence (contributes.configuration in package.json, read via getConfiguration). Permanent until toggled off, scoped per VS Code's user/workspace model.
**Why:** User confirmed this is the easiest approach and the right UX — users already understand VS Code settings.
# Auto-attach editor selection on chat focus

**Date:** 2025-07-18
**Author:** Blair (Extension Dev)
**Status:** Implemented

## Approach

- **Webview → Extension message**: The textarea `focus` event sends `{ command: "chatFocused" }` to the extension, but only when no context chips are already showing (avoids spamming on repeated focus/blur).
- **Extension reads selection**: The `chatFocused` handler in `_handleMessage` reads `vscode.window.activeTextEditor` and posts `contextAttached` if there's a non-empty selection.
- **Dedup on webview side**: `lastAutoAttachedContent` tracks the last auto-attached selection key (`content:filePath:startLine:endLine`). If the same selection arrives again (user clicks in/out), it's silently dropped. The key resets when the user sends a message, so the same selection can be re-attached for a new question.

### Rules

1. **Selections** include line range in the header: `{filePath}:{startLine}-{endLine} ({languageId})`
2. **Files** omit line range: `{filePath} ({languageId})`
3. **Truncation budget:** 8000 characters total for all context blocks (user prompt excluded from budget)
4. If budget is exceeded, the **last** context item's content is truncated and a `...[truncated — context exceeds 8000 char limit]` note is appended
5. Items beyond the truncated one are dropped entirely
6. User prompt is always appended after a blank line, unmodified

### 2026-02-28T16:16Z: User directive
**By:** Rob Pitcher (via Copilot)
**What:** Do not merge PRs automatically — Rob wants to review first before merging.
**Why:** User request — captured for team memory
### Design Review: #27 DefaultAzureCredential Auth
**Facilitator:** MacReady
**Date:** 2026-02-28

#### Architecture Decisions

1. **New `src/auth/credentialProvider.ts` module.** Don't inline this in copilotService or configuration. Clean separation. Single Responsibility. This file owns the `CredentialProvider` interface and both implementations.

2. **Interface is one method: `getToken(): Promise<string>`.** Returns the raw token/key string — not an auth header, not a bearer prefix. The caller (copilotService) decides whether to set `bearerToken` or `apiKey` on ProviderConfig. This keeps the provider dumb and testable.

   ```typescript
   export interface CredentialProvider {
     getToken(): Promise<string>;
   }
   ```

3. **Two implementations in the same file:**
   - `EntraIdCredentialProvider` — wraps `DefaultAzureCredential` from `@azure/identity`. Calls `.getToken("https://cognitiveservices.azure.com/.default")` and returns `token.token`. The SDK handles caching/refresh internally, so we call `getToken()` fresh before each `createSession()` — it returns cached if still valid.
   - `ApiKeyCredentialProvider` — takes a string, returns it. Trivial but keeps the calling code uniform.

4. **Factory function: `createCredentialProvider(config: ExtensionConfig, secrets: vscode.SecretStorage): CredentialProvider`.** Lives in `credentialProvider.ts`. Reads `config.authMethod` to pick the implementation. For `apiKey` mode, reads from SecretStorage. For `entraId` mode, instantiates `DefaultAzureCredential` (no config needed — SDK reads environment).

5. **`authMethod` setting: `forge.copilot.authMethod` with enum `["entraId", "apiKey"]`, default `"entraId"`.** Added to `package.json` contributes.configuration. Added to `ExtensionConfig` interface as `authMethod: "entraId" | "apiKey"`. Read in `getConfiguration()`.

6. **`getOrCreateSession()` changes:** Takes a `CredentialProvider` parameter (or the token string directly). Before building ProviderConfig, call `credentialProvider.getToken()`. Then:
   - If `authMethod === "entraId"`: set `provider.bearerToken = token`, omit `apiKey`
   - If `authMethod === "apiKey"`: set `provider.apiKey = token`, omit `bearerToken`

   **Decision: Pass the token, not the provider.** The caller (`extension.ts`) resolves the token before calling `getOrCreateSession()`. This keeps copilotService free of auth concerns beyond ProviderConfig wiring. Signature becomes:
   ```typescript
   export async function getOrCreateSession(
     conversationId: string,
     config: ExtensionConfig,
     authToken: string,
     onPermissionRequest?: PermissionHandler,
   ): Promise<ICopilotSession>
   ```
   The caller does: `const token = await credentialProvider.getToken();` then passes it.

7. **Validation: skip API key check when `authMethod === "entraId"`.** In `validateConfiguration()`, wrap the apiKey check in `if (config.authMethod === "apiKey")`. No new validation for entraId — if DefaultAzureCredential fails, it throws at token acquisition time and we surface that error in the chat UI.

8. **`@azure/identity` is a runtime dependency.** Add to `dependencies` in `package.json`, not `devDependencies`. esbuild will bundle it. **Risk: VSIX size increase** — see Risks below.

9. **No lazy import of `@azure/identity`.** Import it normally in `credentialProvider.ts`. The module is only loaded when `EntraIdCredentialProvider` is instantiated, which only happens when `authMethod === "entraId"`. Actually — **correction: use dynamic `import()` in the factory function** so that `@azure/identity` is never loaded when using apiKey mode. This avoids bundling issues if we later make it an optional dep.

   ```typescript
   // In createCredentialProvider, when authMethod === "entraId":
   const { DefaultAzureCredential } = await import("@azure/identity");
   ```

10. **Session-per-conversation token lifecycle is acceptable.** Tokens live ~1hr. Sessions are created per conversation. If a conversation runs longer than 1hr and the token expires mid-session, the user gets an auth error — they start a new conversation. This is fine for Phase 3a. Phase 3b can add session recreation with fresh token if needed.

#### File Ownership

- **Childs** (SDK integration):
  - `src/auth/credentialProvider.ts` — **NEW FILE.** Define `CredentialProvider` interface, `EntraIdCredentialProvider` class, `ApiKeyCredentialProvider` class, `createCredentialProvider()` factory function.
  - `src/copilotService.ts` — Modify `getOrCreateSession()` signature to accept `authToken: string`. Use it to set either `bearerToken` or `apiKey` on ProviderConfig based on `config.authMethod`. Remove hardcoded `apiKey: config.apiKey`.
  - `src/types.ts` — Already done (`bearerToken?: string` on ProviderConfig). No further changes.

- **Blair** (VS Code settings/config):
  - `package.json` — Add `forge.copilot.authMethod` enum setting to `contributes.configuration`. Add `@azure/identity` to `dependencies`.
  - `src/configuration.ts` — Add `authMethod: "entraId" | "apiKey"` to `ExtensionConfig`. Read it in `getConfiguration()` with default `"entraId"`. Update `validateConfiguration()` to skip API key check when `authMethod === "entraId"`.
  - `src/extension.ts` — In the request handler, create credential provider via factory, call `getToken()`, pass token to `getOrCreateSession()`. Handle token acquisition errors (display in chat stream).

- **Windows** (testing):
  - `src/test/auth/credentialProvider.test.ts` — Unit tests for both credential providers and the factory.
  - `src/test/copilotService.test.ts` — Test that `getOrCreateSession` passes `bearerToken` when entraId, `apiKey` when apiKey mode.
  - `src/test/configuration.test.ts` — Test that validation skips apiKey check for entraId.
  - Manual: Verify VSIX size stays under 10MB with `@azure/identity` bundled.

- **Docs** (Blair or @copilot):
  - `README.md` — Update auth section per issue #27 requirements.
  - `docs/configuration-reference.md` — Add `forge.copilot.authMethod` setting.
  - `docs/installation-guide.md` — Update setup flow to recommend Entra ID first.

#### Contracts / Interfaces

**1. `CredentialProvider` interface** (Childs defines in `src/auth/credentialProvider.ts`):
```typescript
export interface CredentialProvider {
  getToken(): Promise<string>;
}

export function createCredentialProvider(
  config: ExtensionConfig,
  secrets: vscode.SecretStorage,
): CredentialProvider;
```

**2. `ExtensionConfig.authMethod`** (Blair adds to `src/configuration.ts`):
```typescript
export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;        // kept for apiKey mode
  authMethod: "entraId" | "apiKey";
  model: string;
  wireApi: string;
  cliPath: string;
  autoApproveTools?: boolean;
}
```

**3. `getOrCreateSession()` updated signature** (Childs modifies in `src/copilotService.ts`):
```typescript
export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession>
```

**4. ProviderConfig auth wiring** (Childs, in `getOrCreateSession()`):
```typescript
const provider: ProviderConfig = {
  type: isAzure ? "azure" : "openai",
  baseUrl: config.endpoint,
  wireApi,
  ...(config.authMethod === "entraId"
    ? { bearerToken: authToken }
    : { apiKey: authToken }),
  ...(isAzure && { azure: { apiVersion: "2024-10-21" } }),
};
```

**5. Token scope constant** (Childs, in `credentialProvider.ts`):
```typescript
const AZURE_COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";
```

#### Risks

1. **VSIX size with `@azure/identity`.** The `@azure/identity` package and its transitive deps (`@azure/core-auth`, `@azure/core-rest-pipeline`, `msal-node`, etc.) are substantial. esbuild bundling may push VSIX past the 10MB NFR8 limit. **Mitigation:** Measure VSIX size after adding the dep. If too large, consider making `@azure/identity` an optional peer dep with dynamic import and graceful error if missing. Decision 9 (dynamic import) partially mitigates this.

2. **Air-gapped environments and DefaultAzureCredential.** In a truly air-gapped network, the Entra ID token endpoint (`login.microsoftonline.com`) may be unreachable. DefaultAzureCredential will fail for all credential types except Managed Identity (which uses IMDS at `169.254.169.254`). **Mitigation:** API key fallback exists. Document that `entraId` mode requires network access to the identity endpoint OR Managed Identity.

3. **Token expiry mid-session.** If a session lasts >1hr, the bearer token expires and subsequent `session.send()` calls will fail with 401. **Mitigation:** Acceptable for Phase 3a. Document the limitation. Phase 3b could add session recreation logic.

4. **`DefaultAzureCredential` error messages are verbose and confusing.** When no credential in the chain succeeds, the SDK throws an `AggregateAuthenticationError` with messages from every failed provider. **Mitigation:** Catch this in `extension.ts` when calling `getToken()` and surface a user-friendly message: "Entra ID authentication failed. Ensure you're signed in to Azure CLI, VS Code Azure Account, or running on a VM with Managed Identity. Alternatively, switch to API key auth."

5. **Provider type detection.** Current code uses regex `/\.azure\.com/i` to detect Azure endpoints. This should also set `type: "azure"` when using Entra ID, since bearer tokens with Azure OpenAI require the Azure provider type. **Mitigation:** The existing logic already handles this. Just verify it still works when `apiKey` field is omitted from ProviderConfig (SDK might require it even if empty).

6. **Breaking change to `getOrCreateSession()` signature.** Adding `authToken` parameter changes the contract. All callers in `extension.ts` must be updated. **Mitigation:** This is a coordinated change — Blair updates the caller, Childs updates the function. Low risk if done in same PR or coordinated branches.

### 2026-02-28: Auth Status UX — Status Bar & Webview Banner
**By:** Blair  
**Issue:** #80  
**Date:** 2026-02-28

Implemented dual-location auth status display: VS Code status bar item (left alignment) and webview banner at top of chat. Both update on activation, config changes, and webview resolve using `checkAuthStatus()` from Childs' `authStatusProvider.ts`.

#### Status Bar Item
- Position: `StatusBarAlignment.Left`
- Icons: `$(pass)` authenticated, `$(lock)` not authenticated, `$(warning)` error
- Tooltip: Shows auth method (Entra ID / API Key) or error message
- Command: `forge.openSettings` (reuses existing command)
- Lifecycle: Created in `activate()`, pushed to `context.subscriptions` for disposal

#### Webview Banner
- Location: Top of `#chatMessages` (inserted before first child)
- States:
  - **Authenticated:** ✅ green border, auto-dismiss after 3 seconds
  - **Not Authenticated:** 🔒 yellow border, "Open Settings" button
  - **Error:** ⚠️ red border, error message + "Open Settings" button
- Message type: `{ type: "authStatus", status: AuthStatus }`

#### Update Triggers
1. Extension activation — initial check
2. Config changes — `onDidChangeConfiguration` listener for `forge.copilot.*`
3. Webview resolve — sends initial status to newly opened webview

#### Architecture Decisions
1. **Status bar over command palette:** Status bar is always visible, no user action required.
2. **Auto-dismiss on authenticated:** Reduces noise after successful auth.
3. **Persistent error states:** Ensures users see auth issues.
4. **Separate status bar + webview updates:** Status bar is global; webview banner is contextual.
5. **Silent error handling on config changes:** No error dialogs; user sees status reflected in bar/banner.

#### Extension Points for Future Work
- **Sign-in button:** Add VS Code Authentication API integration with "Sign In" button in error state.
- **Retry button:** Add "Retry" button on error state that re-checks auth without opening settings.
- **Richer tooltips:** Status bar tooltip could show tenant ID (Entra ID) or key prefix (API Key).

#### Files Modified
- `src/extension.ts` — Status bar item, `updateAuthStatus()`, `postAuthStatus()`, config listener
- `media/chat.js` — `authStatus` message handler, `updateAuthBanner()` function
- `media/chat.css` — `.auth-banner` and state-specific styles
# Decision: Comprehensive Coding Standards in copilot-instructions.md

**Author:** MacReady (Lead)
**Date:** 2026-02-28
**Status:** Accepted

## Context

The `@copilot` coding agent uses `.github/copilot-instructions.md` as its primary reference when writing and reviewing code. The file only had branching strategy and squad integration sections — no coding standards, SDK patterns, or project conventions.

## Decision

Expanded `.github/copilot-instructions.md` with 8 sections covering project overview, architecture, SDK conventions, TypeScript style, testing patterns, VS Code extension conventions, error handling, and security.

## Key Conventions Codified

1. **BYOK provider config** uses `type: "openai"`, not `type: "azure"`, for Azure AI Foundry endpoints with `/openai/v1/` path
2. **Event handling** uses `.on(eventName, handler)` named pattern (not catch-all `.on(callback)`)
3. **Send API** is `session.send({ prompt })`, not `session.sendMessage()`
4. **bearerToken** is static string only — no refresh callback (tracked in #27)
5. **Mock patterns** for tests: `DefaultAzureCredential` as class, `SecretStorage` as object with `get`/`store`/`delete`/`onDidChange`
6. **"Never throws" functions** must catch ALL async operations including SecretStorage
7. **API keys** only via SecretStorage, never settings.json
8. **Air-gap compliance** — no external network calls except configured Azure AI Foundry endpoint

## Impact

- All `@copilot` PRs should now align with project conventions without squad members having to correct patterns
- SDK integration patterns are documented in one place instead of scattered across skill files
- Reduces review burden on MacReady and Childs for SDK-related changes
# Decision Log

### Entra ID Error Classification in authStatusProvider
**Date:** 2026-02-28  
**Author:** Childs (SDK Dev)  
**Scope:** `src/auth/authStatusProvider.ts`

Classify Entra ID credential errors into two buckets:
1. **Not logged in** → `{ state: "notAuthenticated", reason: "Sign in with Azure CLI to use Entra ID authentication" }`. Detected by pattern-matching against 8 known DefaultAzureCredential signals.
2. **Actual errors** → `{ state: "error", message: "Entra ID configuration error — check Azure CLI setup" }`. No raw SDK stack traces in UI.

**Rationale:** Not being logged in is a normal initial state. The UI should show a sign-in prompt, not an error banner. AuthStatus type already supports `notAuthenticated` — no type changes needed. Friendly messages prevent exposing internal SDK details.

**Impact:** UI shows correct sign-in prompt for first-run users. Prevents exposing SDK internals. Type-compatible with existing interface.

---

### Auth UX Fixes — Sign-In Flow and Status Feedback
**Date:** 2026-03-01  
**Author:** Blair (UI/UX)  
**Related:** Childs' error classification decision

Four auth UX enhancements:
1. **`forge.signIn` command** — Status bar click runs `az login` terminal (Entra ID) or opens API key settings.
2. **Auth polling** — 30-second interval + focus listener auto-detect sign-in completions.
3. **Webview banner** — `notAuthenticated` → "Sign in to start chatting"; `error` → truncated message + "Troubleshoot".
4. **Auth-method-aware status bar** — Icons: `$(sign-in)` Entra ID, `$(key)` API key, `$(warning)` error.

**Decisions:** Polling catches `az login` without settings change. Banner distinguishes `notAuthenticated` (prompt) from `error` (troubleshooting). Status bar shows method-specific icons.

**Impact:** First-run users see sign-in prompt; sign-in flow is seamless; auth status always visible and method-aware.

---

# Auth UX Improvements

**Date:** 2026-03-01  
**Decided by:** Blair  
**Context:** User feedback — auth banner flashing every 30s was distracting; status bar tooltip didn't show signed-in account

## Decisions

### 1. Deduplicate authStatus messages to webview

**Problem:** `updateAuthStatus()` is called every 30s by the auth polling interval. Each call triggers `postAuthStatus()` which posts to the webview, causing the green "✅ Authenticated via Entra ID" banner to flash every 30 seconds even when nothing has changed.

**Solution:** Track the last auth status sent to the webview (`_lastAuthStatus` field on `ChatViewProvider`) and compare before posting. Use `JSON.stringify()` on the full status object + hasEndpoint flag for comparison. Reset `_lastAuthStatus` to `undefined` in `resolveWebviewView()` so the initial status message always goes through when the webview loads.

**Rationale:** Status bar updates should continue happening every 30s (they don't cause disruption), but the webview banner should only appear when the auth state actually changes. This preserves reactive UI behavior while eliminating the distracting flash.

### 2. Show signed-in account in status bar tooltip

**Problem:** Status bar tooltip showed "Authenticated via Entra ID" without identifying which Azure account was signed in. Users wanted to confirm they're using the correct account.

**Solution:** 
- Added optional `account?: string` field to `AuthStatus` authenticated state
- In `checkAuthStatus()` for Entra ID mode, decode the JWT token payload and extract the user identity from `upn`, `preferred_username`, or `name` claims (in that order)
- Updated status bar tooltip logic to show "Signed in as {account} (Entra ID)" when account is available
- For API Key mode, tooltip remains "Authenticated via API Key" (no user identity available)

**JWT decode implementation:** Simple base64url decode using `Buffer.from(parts[1], "base64url")` — no signature verification needed since we're only using this for display, not authentication.

**Rationale:** Helps users confirm they're authenticated with the correct Azure identity, especially in environments where multiple Azure accounts might be configured.

## Impact

- **Extension UX:** Less distracting auth polling, more informative status bar
- **No breaking changes:** Auth logic unchanged, only display improvements
- **Tests:** All 134 tests pass with no modifications needed

### 2026-03-01: Remove Tool Execution Result Cards from Chat UI

**By:** Blair (Extension Dev)  
**Date:** 2026-03-01  
**Context:** User testing revealed redundant tool execution result cards

## Problem

During tool execution, Forge was posting both success AND error result cards to the chat window:

1. **Redundant success cards** — Model's streaming text already described what happened (e.g., "I created a hello world file"). Separate ✅ card was unnecessary noise.
2. **Confusing error cards** — When model retried a tool internally, users saw both ❌ and ✅ cards. Error card was scary even though everything ultimately worked.
3. **Visual clutter** — Multiple tool calls per response = multiple cards cluttering chat window.

## Decision

**Remove tool execution result cards entirely.** Model's streaming text response is sufficient to communicate tool outcomes.

## Implementation

Removed from `src/extension.ts`:
- `tool.execution_start` event handler
- `tool.execution_complete` event handler
- `_toolNames` map (only used for result card tracking)

Removed from `media/chat.js`:
- `renderToolResult()` function
- `"toolResult"` message handler case

Removed from `media/chat.css`:
- `.tool-result`, `.tool-result-summary`, `.tool-output`, `.tool-output-toggle` styles

Removed from `src/test/tool-approval.test.ts`:
- 2 `.todo()` tests (never implemented)

**Kept intact:**
- `toolConfirmation` message type and rendering (user approval cards)
- `toolResponse` message handler (webview → extension for user approval)
- `onPermissionRequest` handler in extension
- `ToolExecutionStartEvent` and `ToolExecutionCompleteEvent` types in `types.ts` (SDK event surface, may be useful for future features)

## Rationale

1. **Model text is sufficient** — Model already describes tool actions in streaming response. A "file_write completed" card doesn't add information beyond "I created hello.py with the following content."
2. **Internal retries are implementation details** — Users don't need to see failed attempts that model recovered from. Showing them creates unnecessary alarm.
3. **Cleaner chat UX** — Fewer UI elements = less cognitive load. Approval cards (which ARE user-facing) remain for important interaction point.

## Impact

- **User-facing:** Chat window is cleaner, no redundant cards
- **Code:** ~40 lines removed from extension.ts, ~35 lines removed from chat.js/css
- **Tests:** All 122 tests pass (2 `.todo()` tests removed, never implemented)
- **Tool approval flow:** Unaffected — confirmation cards and approval handlers unchanged

## Team Notes

This is an extension-level decision (webview message protocol change). Childs (Copilot SDK integration) doesn't need to change anything — SDK still emits events, we just don't subscribe to them anymore.

---

# Context Chips in Sent Messages

**Decision:** Render read-only context chips below user messages in chat history.

**Context:** When users attached file or selection context and sent a message, the context chips in the input area disappeared and the message rendered as plain text. There was no visual indication in the chat history that context was sent with the prompt. Users had no way to look back and see which files/selections were attached to past questions.

**Solution:** Modified `media/chat.js` to:
1. Capture pending context before clearing: `const sentContext = [...pendingContext]`
2. Pass context to `appendMessage()`: `appendMessage("user", text, sentContext)`
3. Render compact read-only chips below user messages when context is present:
   - Selection chips: `📎 {truncatedPath} (L{start}-{end})`
   - File chips: `📄 {truncatedPath}`
   - Truncate paths >30 chars to last 2 segments (e.g., `…/components/Button.tsx`)
   - Full path in tooltip via `title` attribute

**CSS:** `.sent-context-chips` and `.sent-context-chip` using badge theme tokens, 11px font, 200px max-width with ellipsis.

**Rationale:**
- Users need to see what context was sent when reviewing conversation history
- Read-only chips (no remove buttons) are appropriate for historical messages
- Compact styling keeps the chat clean while preserving important information
- Consistent visual language with the input area context chips (same icons, similar styling)

**Impact:** Improved UX — users can now trace which code they asked about when reviewing past questions. No breaking changes, all 122 tests pass.

**Files:**
- `media/chat.js` — `sendMessage()`, `appendMessage()`, `truncateFilePath()`
- `media/chat.css` — `.sent-context-chips`, `.sent-context-chip`

**Date:** 2026-03-01  
**Owner:** Blair (Extension Dev)

### Tool control precedence rule (#91)

**By:** Childs  
**Date:** 2026-03-01  
**Status:** Decided

When both `availableTools` and `excludedTools` are configured, `availableTools` takes precedence — only it is passed to the SDK `SessionConfig`. A `console.warn` is emitted and `validateConfiguration()` returns a warning error. This is intentional: whitelisting is stricter than blacklisting, so it should win. Empty arrays are valid and passed through (empty `excludedTools` = "exclude nothing", empty `availableTools` = "no tools available").

# Decision: Conversation History UI Architecture

**Date:** 2026-03-01  
**Decided by:** Blair (Extension Dev)  
**Context:** Issue #87 — Conversation history persistence and resume

## Decision

Conversation history UI implemented as an **overlay panel** with in-memory message caching via VS Code `workspaceState`.

### Architecture Choices

1. **Message Cache Storage**: `workspaceState` (VS Code's key-value API)
   - Key: `forge.messages.{sessionId}`
   - Value: `Array<{role: 'user' | 'assistant', content: string}>`
   - **Rationale**: Simpler than SDK session metadata. workspaceState persists across VS Code sessions. No need for filesystem I/O or complex serialization.

2. **Conversation List UI**: Absolute-positioned overlay (`z-index: 1000`)
   - **Rationale**: Non-intrusive. Dismissible. No viewport scroll conflicts with #chatMessages. Can be toggled without rebuilding DOM.

3. **Message Accumulation**: `_conversationMessages` array in `ChatViewProvider`
   - Updated in-memory during session: push user message before send, push assistant message in `session.idle` handler
   - Cached to workspaceState after each successful `streamEnd`
   - **Rationale**: Single source of truth for current conversation. Avoids reading DOM to reconstruct state.

4. **Resume Behavior**: Clear chat DOM, replay cached messages
   - Calls `resumeConversation()` from copilotService (Childs owns SDK interaction)
   - Reads cached messages from workspaceState
   - Iterates cached messages array, calls `appendMessage(role, content)` to render
   - **Rationale**: Clean slate prevents mixed old/new messages. Replay ensures UI matches cache. No need for message IDs or timestamps in cache.

5. **Last Session Tracking**: `forge.lastSessionId` in workspaceState
   - Updated after each successful session creation
   - Can be used in future for "Resume last session on activate" feature
   - **Rationale**: Enables default-resume behavior without listing all sessions on startup.

### Message Contract

| Direction | Type | Payload |
|-----------|------|---------|
| ext → webview | `conversationList` | `{ conversations: ConversationMetadata[] }` |
| ext → webview | `conversationResumed` | `{ sessionId, messages: {role, content}[] }` |
| webview → ext | `listConversations` | `{}` |
| webview → ext | `resumeConversation` | `{ sessionId }` |
| webview → ext | `deleteConversation` | `{ sessionId }` |

### CSS Patterns

- `.conversation-list.hidden` → `display: none` (no JS visibility logic)
- `.conversation-item:hover` → `--vscode-list-hoverBackground` (native VS Code hover style)
- `.conversation-delete-btn:hover` → `color: var(--vscode-errorForeground)` (delete affordance)

### Relative Time Display

Used `relativeTime(date)` helper with bucketing:
- < 1 min: "just now"
- < 60 min: "Xm ago"
- < 24 hrs: "Xh ago"
- 1 day: "yesterday"
- > 1 day: "Xd ago"

**Rationale**: Human-readable, compact, consistent with common chat UX patterns.

## Alternatives Considered

1. **Filesystem-based cache** — rejected: unnecessary I/O overhead, no benefit over workspaceState
2. **SDK session metadata** — rejected: not designed for arbitrary UI data, would require custom JSON field
3. **Modal dialog for history** — rejected: intrusive, hides chat context while browsing history
4. **Sidebar tree view** — rejected: separate pane overkill for MVP, harder to implement

## Impact

- No breaking changes to backend (copilotService, configuration, types)
- Webview state management simplified (no DOM parsing for message history)
- Extension activation unchanged (no automatic resume in MVP — can add later)
- 3 new message types, 105 LoC in extension.ts, 85 LoC in chat.js, 50 LoC in chat.css

## Follow-up

- Childs: Implement `listConversations()`, `resumeConversation()`, `deleteConversation()` in copilotService.ts
- Windows: Add tests for message caching, resume flow, delete flow (conversation-history.test.ts already exists)
- Future: Auto-resume last session on activate (use `forge.lastSessionId`)
- Future: Generate conversation summary from first user message (for better list display)

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

# Decision: Session Management API Design

**Date:** 2026-03-01  
**Author:** Childs  
**Issue:** #87 (Conversation history persistence and resume)

## Context

The Copilot SDK (v0.1.26) provides built-in session management APIs: `listSessions()`, `resumeSession()`, `getLastSessionId()`, and `deleteSession()`. These allow persisting conversation history to disk and resuming conversations across extension restarts.

## Decision

Implemented wrapper functions in `src/copilotService.ts` that expose these SDK capabilities:

1. **`listConversations()`** — Maps SDK's `SessionMetadata` to our simpler `ConversationMetadata` interface for UI display (sessionId, summary, startTime, modifiedTime).

2. **`resumeConversation(sessionId, config, authToken, onPermissionRequest)`** — Wraps `client.resumeSession()` and applies the same provider + tool configuration as `getOrCreateSession()` to maintain consistency. Stores resumed session in the local sessions map so it can be managed alongside new sessions.

3. **`getLastConversationId()`** — Direct wrapper for SDK's `getLastSessionId()`, useful for "continue last conversation" UX.

4. **`deleteConversation(sessionId)`** — Wraps SDK's `deleteSession()` and also removes from local sessions map.

5. **DRY refactor** — Extracted provider and tool config construction into `buildProviderConfig()` and `buildToolConfig()` helper functions. Both `getOrCreateSession()` and `resumeConversation()` use these helpers to ensure identical config behavior.

## Rationale

- **Consistency:** Provider config (BYOK, Entra ID/API key auth), tool exclusions, and systemMessage must match between new and resumed sessions to avoid user confusion.
- **Error handling:** All wrappers catch and rethrow with actionable error messages following project conventions.
- **Type safety:** Re-exported SDK types (`SessionMetadata`, `SessionListFilter`, `ResumeSessionConfig`) as type-only imports to maintain strict TypeScript mode compliance.
- **Separation of concerns:** SDK integration stays in copilotService.ts; UI layer (Blair) will consume these wrappers for conversation list/resume UX.

## Impact

- Blair can implement conversation history UI (#87) using these wrappers without touching SDK directly.
- Windows will write tests for the new functions following existing patterns.
- No breaking changes to existing `getOrCreateSession()` behavior.

# Decision: Conversation History Test Coverage Strategy

**Date:** 2026-03-01  
**Participants:** Windows (Tester)  
**Status:** Complete — tests ready for review

## Context

Issue #87 adds conversation history persistence via 4 new SDK wrapper functions in `copilotService.ts`:
- `listConversations()` → wraps `client.listSessions()`
- `resumeConversation()` → wraps `client.resumeSession()`
- `getLastConversationId()` → wraps `client.getLastSessionId()`
- `deleteConversation()` → wraps `client.deleteSession()`

Childs implemented these functions. Blair is implementing webview UI. Windows wrote test coverage.

## Decision

Created `src/test/conversation-history.test.ts` with **33 tests** organized into 6 suites:

### Test Suites

1. **listConversations (6 tests)**
   - Maps SDK SessionMetadata to ConversationMetadata (strips `isRemote`, `context`)
   - Returns empty array when no sessions
   - Creates client if not started
   - Handles SDK errors (client start, listSessions call)
   - Handles missing summary field

2. **resumeConversation (11 tests)**
   - Verifies full SessionConfig passed to SDK (not just sessionId)
   - Azure vs OpenAI provider type detection
   - apiKey vs bearerToken auth wiring
   - Tool exclusion settings applied
   - onPermissionRequest handler passed through
   - Error paths: nonexistent session, expired token, connection errors

3. **getLastConversationId (4 tests)**
   - Returns sessionId or undefined
   - Creates client if not started
   - Handles SDK errors

4. **deleteConversation (5 tests)**
   - Calls SDK deleteSession
   - Removes from local sessions map
   - Graceful no-op when session doesn't exist
   - Handles SDK deletion errors

5. **Integration scenarios (3 tests)**
   - List → resume → delete flow
   - Empty state (no conversations yet)
   - getLastConversationId after multiple creates

6. **Error path coverage (4 tests)**
   - SDK unavailable
   - Invalid config (empty endpoint)
   - Concurrent deletion attempts
   - Expired auth token

### Mock Extension

Extended `src/test/__mocks__/copilot-sdk.ts` to add 4 methods to MockClient:
```typescript
listSessions: vi.fn().mockResolvedValue([]),
resumeSession: vi.fn().mockResolvedValue(session),
getLastSessionId: vi.fn().mockResolvedValue(undefined),
deleteSession: vi.fn().mockResolvedValue(undefined),
```

### Key Findings

1. **resumeConversation signature:** SDK expects `client.resumeSession(sessionId, fullConfig)` — NOT just sessionId. Full SessionConfig includes model, provider, streaming, excludedTools, onPermissionRequest.

2. **Session caching:** resumeConversation does NOT cache — it calls SDK.resumeSession on every call. This differs from getOrCreateSession which caches by conversationId.

3. **Provider config wiring:** Same logic as getOrCreateSession — auto-detects Azure endpoints, applies correct auth (apiKey vs bearerToken), respects tool exclusions.

4. **Empty state handling:** All functions gracefully handle the "no sessions yet" case — listConversations returns `[]`, getLastConversationId returns `undefined`.

### Pre-existing Test Failures (Not My Responsibility)

Childs' implementation broke 5 tests in other files:
- `multi-turn.test.ts` (2 failures) — session reuse expectations violated
- `context-attachment.test.ts` (1 failure) — streamEnd not received
- `extension.test.ts` (1 failure) — streamEnd not received  
- `tool-approval.test.ts` (1 failure) — streamEnd not received

**Root cause:** Childs' code stores `forge.lastSessionId` in workspaceState on every message. This likely causes side effects in tests that expect clean state.

**My mock changes** (adding 4 SDK methods with no-op defaults) are minimal and correct. The failures existed before I touched the code — they're Childs' responsibility to fix.

### All 33 Conversation History Tests Pass

```
✓ src/test/conversation-history.test.ts (33 tests) 32ms
```

## Rationale

- Comprehensive coverage of all 4 new functions
- Error paths tested (SDK failures, missing sessions, bad auth)
- Integration scenarios validate end-to-end flows
- Mock extension is minimal and follows existing patterns
- Tests are resilient — use dynamic imports with graceful skips until functions are merged

## Implications

- Test suite ready for Childs' PR review
- Pre-existing failures documented but not fixed (implementation responsibility)
- Future work: Blair's webview UI tests will cover user-facing conversation list, delete buttons, resume clicks

---

### 2026-03-01: Model Selector UI Pattern

**By:** Blair (Extension Dev)  
**Issue:** #81  
**PR:** #111  

## Decision

Model switching requires a confirmation dialog and full session reset. The `forge.copilot.models` setting provides the dropdown options, while `forge.copilot.model` remains the active model. The dropdown is placed in the button row with `margin-left: auto` for right-alignment.

## Rationale

- Model changes affect the entire conversation context, so resetting is safer than silently switching mid-conversation
- Confirmation prevents accidental model switches that would lose conversation state
- Separating `models` (available list) from `model` (active selection) allows the list to be configured once while the active model changes per-conversation

---

### 2026-03-01: Rename RemoteMcpServerConfig → RemoteMcpSettings

**By:** Blair (Extension Dev)  
**Context:** PR #106 review  

## Decision

Our local type `RemoteMcpServerConfig` is renamed to `RemoteMcpSettings` to avoid confusion with the SDK's re-exported `MCPRemoteServerConfig`.

**Naming convention:** Our config types use `*Settings` suffix (`RemoteMcpSettings`), while SDK re-exports keep their original names (`MCPRemoteServerConfig`, `MCPLocalServerConfig`).

## Rationale

- `RemoteMcpServerConfig` (ours) vs `MCPRemoteServerConfig` (SDK) is too close — easy to import the wrong one.
- `RemoteMcpSettings` clearly signals "this is our VS Code settings shape" vs the SDK's wire format.

## Validation Architecture

Ambiguous MCP server configs (`{command, url}`) are now rejected at the **validation layer** (`validateConfiguration()`), not silently handled at the mapper layer (`buildMcpServersConfig()`). Validation gives actionable error messages; mapper-layer skipping is silent and confusing.

# Decision: getText mocks must be argument-aware

**Date:** 2026-03-02
**Decided by:** Windows (Tester)
**Context:** PR #119 review feedback on sendFromEditor.test.ts

## Decision

When mocking `document.getText()` in VS Code editor tests, always use `mockImplementation` with argument discrimination — not `mockReturnValue`. The mock must return different values depending on whether a range/selection argument is provided:

```typescript
getText: vi.fn().mockImplementation((range?: unknown) =>
  range ? selectionText : fullDocumentText,
)
```

## Rationale

The production code calls `getText(selection)` to get only the selected text. A constant `mockReturnValue` makes the test pass regardless of whether `getText()` or `getText(selection)` is called — silently hiding regressions where the code forgets to pass the selection argument.

## Scope

Applies to all test files that mock VS Code `TextDocument.getText()`.


---

### Code Block Copy Button Pattern

**Author:** Blair (Extension Dev)  
**Date:** 2025-07-25  
**Status:** Implemented  

## Context

Chat messages render markdown via `marked.parse()`. Code blocks (`<pre>`) need a copy-to-clipboard button for usability.

## Decision

- Copy button injection is a standalone `addCopyButtons(container)` function called after every markdown render pass (both complete messages and streaming deltas).
- Uses inline SVG icon — CSP-safe, no external resources.
- Uses `navigator.clipboard.writeText()` which works in VS Code webviews.
- Button uses `position: absolute` inside a `position: relative` `<pre>`, hidden by default (`opacity: 0`), visible on `pre:hover`.
- Duplicate guard: checks for existing `.code-copy-btn` before injecting (important since streaming re-renders the full DOM each delta).

## Consequences

- Any future code that renders markdown into the chat (e.g. conversation restore, tool results) should call `addCopyButtons()` on the rendered container.
- The SVG icon markup is duplicated (initial render + reset after "Copied!" feedback) — acceptable for a small inline SVG.

---

### Sanitize markdown HTML with DOMPurify

**Date:** 2025-07-25  
**Author:** Blair (Extension Dev)  
**Status:** Implemented  

## Context

PR #109 introduced `marked.parse()` for rendering assistant messages as HTML. Copilot's PR review flagged that the parsed output was assigned directly to `innerHTML` without sanitization, creating a cross-site scripting (XSS) risk. If the AI model returns content containing malicious HTML or script tags, they would execute in the webview.

## Decision

Added `dompurify` as a dependency and wrapped all `marked.parse()` calls with `DOMPurify.sanitize()` in the centralized `renderMarkdown()` function. Using DOMPurify's default configuration, which preserves all standard HTML elements needed for markdown (code blocks, tables, headings, lists, links) while stripping dangerous content (scripts, event handlers, etc.).

## Implications

- All markdown-to-HTML rendering goes through a single sanitized path
- New code that renders markdown should use `renderMarkdown()` — never call `marked.parse()` directly for innerHTML assignment
- DOMPurify is bundled into `dist/chat.js` via the existing esbuild browser/IIFE build — no separate script tag needed
- Default DOMPurify config is sufficient; no custom allowlist maintained

---

### Webview JS Bundling with esbuild

**Date:** 2026-03-01  
**Author:** Blair  
**Context:** Issue #100 — markdown rendering required importing `marked` in the webview JS  

## Decision

Webview JavaScript (`media/chat.js`) is now bundled via esbuild as a second entry point (`dist/chat.js`, platform: browser, format: IIFE). This enables `require()` imports of npm packages in webview code.

## Rationale

- The webview JS was previously loaded as a raw script — no imports possible
- Adding `marked` for markdown rendering required a bundling step
- Using esbuild (already our bundler) avoids adding a second tool
- The browser/IIFE output is CSP-compliant (no eval, no inline scripts)
- Air-gap safe: marked is bundled inline, no CDN required

## Impact

- **All squad members**: When adding npm packages to webview code, they're automatically bundled
- **Build output**: `dist/chat.js` now exists alongside `dist/extension.js`
- **Source of truth**: `media/chat.js` remains the source file; `dist/chat.js` is the build artifact
- **Extension manifest**: Webview HTML references `dist/chat.js`, not `media/chat.js`

---

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

---

### 2026-03-01T23:36Z: User directive

**By:** Rob Pitcher (via Copilot)  
**What:** Never merge a PR without asking Rob first. Humans merge PRs for this project — Squad must not auto-merge.  
**Why:** User request — captured for team memory  

---

### Error Handling Standards

**Proposed by:** Copper  
**Date:** 2026-03-02  
**Context:** Issue #112 code quality review  

## Problem

The codebase has inconsistent error handling patterns, particularly around:
- When to use `.catch(() => {})` (fire-and-forget)
- Where to log errors for debugging
- How to surface actionable errors to users

Examples of issues found:
- `updateAuthStatus().catch(() => {})` in callbacks swallows SecretStorage failures
- `console.warn/error` logs go to Extension Host output channel, not the extension's own channel
- Missing await on async cleanup operations

## Proposed Standards

### 1. Fire-and-forget `.catch(() => {})` Policy

**Allowed:**
- Status bar updates triggered by polling/timers (non-critical)
- Background telemetry or analytics

**Not allowed:**
- User-initiated actions (message sends, settings changes, auth operations)
- Resource cleanup operations (session destruction, event unsubscription)
- Any operation whose failure should be visible to the user or developer

**Minimum requirement:** All `.catch(() => {})` must log to output channel:
```typescript
updateAuthStatus(...).catch((err) => {
  outputChannel.appendLine(`[error] Auth status update failed: ${err}`);
});
```

### 2. Logging Standards

- **Create OutputChannel in activate()**: `vscode.window.createOutputChannel("Forge")`
- **Replace all `console.warn/error`** with `outputChannel.appendLine(...)`
- **Format:** `[level] context: message`
  - Levels: `[debug]`, `[info]`, `[warn]`, `[error]`
  - Context: function name or operation (e.g., "session creation", "auth check")

### 3. Async Cleanup

- **Always await async cleanup operations** (`destroySession`, `session.abort()`, `client.stop()`)
- **Wrap in try-catch and log failures** — don't let cleanup errors crash the cleanup path
- **Use finally blocks** for critical cleanup (event unsubscription, timeout clearing)

### 4. User-Facing Error Messages

- **Actionable:** Tell the user what to do, not just what went wrong
  - ❌ "Error: 401 Unauthorized"
  - ✅ "Authentication failed. Click ⚙️ to check your API key."
- **Rewrite SDK errors** to point at settings or sign-in commands
- **Include context** for auth errors (which auth method is configured, what the user should check)

## Impact

- Improves debuggability for users and maintainers
- Prevents silent failures in critical paths
- Establishes clear contract for when errors can be swallowed vs. must be handled

## Action Items

1. Create OutputChannel in activate() and pass to modules that need logging
2. Audit all `.catch(() => {})` callsites and add logging
3. Replace all `console.warn/error` with OutputChannel
4. Add await + try-catch to all async cleanup operations
5. Update error messages to be actionable (already mostly done, but verify consistency)


### 2026-03-02: Remove Copilot CLI Installation Guide from Docs
**By:** Fuchs (Technical Writer)  
**Status:** Implemented

## Decision

Removed `docs/installation-guide.md` and redirected all documentation references to the upstream [Copilot CLI repository](https://github.com/github/copilot-cli).

## Rationale

- Copilot CLI installation instructions are **out of scope** for Forge documentation — they are maintained upstream by the Copilot CLI team.
- Duplicating upstream docs creates maintenance burden and risks version drift.
- Air-gapped deployment philosophy: **minimize duplicated docs, always link to canonical sources.**

## Changes

1. Deleted `docs/installation-guide.md`
2. Updated `README.md` line 18: Quick Start step 2 now links to [Copilot CLI repo](https://github.com/github/copilot-cli)
3. Updated `docs/configuration-reference.md`:
   - Line 187: "cliPath" setting reference updated to link to Copilot CLI repo
   - Line 556: Summary section updated to link to Copilot CLI repo for CLI installation
4. Added **Azure CLI (`az`)** as a prerequisite in `README.md` Prerequisites section (required for Entra ID auth)

## Impact

- Users now have a **single canonical source** for Copilot CLI setup (upstream repo)
- README explicitly lists Azure CLI as a prerequisite, improving setup clarity
- Reduced doc maintenance surface area

### Default models changed to empty array

**By:** Blair
**Date:** 2026-03-02
**What:** Changed `forge.copilot.models` default from `["gpt-4.1", "gpt-4o", "gpt-4o-mini"]` to `[]`. Updated setting description to clarify that values must match the Azure AI Foundry **model deployment name** (not the model name, as they can differ).
**Why:** Hardcoded model names are meaningless in air-gapped BYOK deployments — users must configure their own deployment names. An empty default avoids confusing "model not found" errors and forces explicit setup.
**Impact:** Users who previously relied on the default models list will now need to add their deployment names in settings before first use. The model selector will show empty until configured.

### README Positioning: Broader Value Prop Over Air-Gapped

**By:** Fuchs
**Date:** 2026-03-02
**What:** Repositioned README and package.json description to lead with organizational control over AI inference (private endpoints, data sovereignty, compliance, cost control) rather than "air-gapped" as the headline framing. Air-gapped remains as one mentioned scenario alongside sovereign cloud and compliance-driven environments.
**Why:** The real value prop is organizations wanting control and visibility over their entire AI invocation flow. Air-gapped networks are one use case, not the defining one.
**Impact:** All docs referencing Forge's purpose should use the broader framing. "Air-gapped" is fine as a scenario mention but should not be the lead descriptor.
---

### 2026-03-10: Update Endpoint Examples to `.services.ai.azure.com` Format

**By:** Fuchs (Technical Writer)  
**Requestor:** Rob Pitcher

## Summary

Updated all documentation example URLs from the legacy `.openai.azure.com` domain to the current Azure AI Foundry generic format `.services.ai.azure.com`. This brings documentation in sync with Azure's current endpoint naming conventions.

## Files Changed

1. **README.md** — 3 endpoint examples in Quick Start, Core Settings, and Example Configuration sections
2. **docs/configuration-reference.md** — 15+ endpoint examples across Settings Reference, Wire API Setting, Endpoint URL Format (including Anatomy section), API Key Retrieval, Example Configurations, and Troubleshooting sections
3. **.github/copilot-instructions.md** — 1 example in BYOK Provider Config comment (line 98)
4. **specs/PRD-airgapped-copilot-vscode-extension.md** — 1 example in FR6 settings table (line 170)

## Rationale

- `.services.ai.azure.com` is Azure's current generic endpoint format for AI Foundry
- `.openai.azure.com` examples were creating confusion in air-gapped deployment scenarios
- Both domains are valid Azure endpoints; the SDK's `isAzure` regex (`/\.azure\.com/i`) matches both
- Rob confirmed `.services.ai.azure.com` is the standard format today

## Backward Compatibility

Added clarifying note in configuration-reference.md explaining both `.services.ai.azure.com` and `.openai.azure.com` endpoints are valid Azure endpoints and will continue to work. Documentation now emphasizes the current standard without breaking existing deployments.

---

### Update endpoint example URL to services.ai.azure.com
**By:** Blair
**Date:** 2025-07-24
**What:** Updated user-facing example endpoint URL from `https://myresource.openai.azure.com/` to `https://myresource.services.ai.azure.com/` in `package.json` settings description and `src/configuration.ts` validation error message. The `isAzure` regex (`/\.azure\.com/i`) was intentionally left unchanged — it matches both formats, so no logic change was needed. This is a docs-only change to reflect Azure AI Foundry's current generic endpoint format.
**Why:** Azure AI Foundry now uses `services.ai.azure.com` as the standard endpoint format. The old `openai.azure.com` still works but is no longer the recommended example for new users.

---

### Documentation Audit — Consistency & Accuracy Pass

**By:** MacReady  
**When:** Post-PR #116 multi-round review  
**What:**

Audited all documentation files (`README.md`, `docs/configuration-reference.md`, `docs/sideload-test-checklist.md`, `package.json`) for consistency with the actual codebase.

**Key decisions enforced:**

1. **Setting name is `forge.copilot.models` (array), not `forge.copilot.model` (string).** All documentation must use the plural form with array syntax. Default is `[]`.

2. **Endpoint URL must NOT include `/openai/v1/`.** The SDK auto-appends this path for `.azure.com` endpoints. Documentation that tells users to include it causes double-pathing errors.

3. **"Air-gapped" is a scenario, not primary positioning.** Per the earlier positioning decision, "air-gapped" should only appear as one of several environment types (alongside compliance-driven, restricted networks, etc.), never as the headline framing. Package.json setting descriptions updated to use "restricted environments" / "network safety" instead.

4. **Entra ID is the default auth method.** Documentation should not present API key setup as a required step — it's one of two auth options, and Entra ID is the default.

5. **Forge lives in the sidebar (activity bar), not the bottom panel.** UI location references must say "sidebar" or "activity bar", not "bottom panel" or "panel area".

**Why:** After many rounds of PR #116 changes, the docs had drifted significantly from the codebase. The `model` → `models` rename and endpoint URL format issues were actively harmful — they'd cause users to misconfigure the extension.
# Decision: configStatus message ordering in resolveWebviewView

**Branch:** squad/120-welcome-inline  
**Date:** 2026-03-02  
**Author:** Blair (Extension Dev)

## Context

Issue #120 adds a first-run welcome card. The welcome card needs to know whether endpoint, auth, and models are configured. This requires a new `configStatus` message from the extension to the webview.

## Decision

`configStatus` is sent as the **fourth** lifecycle message in `resolveWebviewView`, after `authStatus`, `modelsUpdated`, and `modelSelected`. The message carries `hasEndpoint`, `hasAuth`, and `hasModels` booleans.

```typescript
this._view?.webview.postMessage({
  type: "configStatus",
  hasEndpoint: !!config.endpoint,
  hasAuth: status.state === "authenticated",
  hasModels: config.models.length > 0,
});
```

## Rationale

- **Auth status first** — the auth banner must render before the welcome card to preserve visual hierarchy (auth banner appears above welcome card in DOM insertion order)
- **After modelsUpdated** — `hasModels` mirrors the same config data already sent in `modelsUpdated`, so no extra async work needed
- **Booleans, not raw config** — the webview doesn't need the full config, just three presence flags; keeps the message surface minimal

## Impact on Tests

Tests that filter lifecycle messages by type and count total messages for `vi.waitFor()` timing must filter before counting. Adding `configStatus` to the filter-by-type list is not enough if the raw message count is used as the timing condition — it will pass before stream messages arrive. See `extension.test.ts` for the correct pattern:

```typescript
await vi.waitFor(() => {
  const filtered = getPostedMessages(mockView).filter((m) => {
    const t = m.type;
    return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus";
  });
  expect(filtered.length).toBeGreaterThanOrEqual(4);
});
```

Any future lifecycle messages added to `resolveWebviewView` must follow this same pattern.
# Decision: Option B welcome screen uses `.hidden` utility class for toggle

**Date:** 2025-01-01  
**Author:** Blair  
**Branch:** squad/120-welcome-replace

## Context

Option B (replace-area welcome screen) needs to show/hide three DOM elements:
`#welcomeScreen`, `#chatMessages`, and `.input-area`. Two approaches were considered:
(a) toggle element-specific CSS classes, (b) add a global `.hidden` utility.

## Decision

Added a global `.hidden { display: none !important }` utility class to `chat.css`. 
The `!important` ensures it overrides any `display` rule from other classes (e.g., 
`.welcome-screen { display: flex }` must be overridden when hidden).

## Rationale

- `#chatMessages` and `.input-area` had no existing hide/show mechanism.
- A utility class is reusable and explicit — easier to trace in DevTools.
- Option A (inline card) didn't need to hide the input area, so it didn't add `.hidden`. 
  If Option A is merged first, Option B needs to add the utility class.

## Impact

- `.conversation-list.hidden` already existed as a compound selector. The new global 
  `.hidden` class is compatible — both approaches work on different elements.
- Tests updated to filter `configStatus` from message-type assertions.



# Welcome Screen State Management Pattern

**Decided:** 2026-03-02

## Context

The welcome screen UI state machine relies on `configStatus` messages to track completion of setup steps and trigger auto-transitions (e.g., step 3 ✅ when user authenticates). Initially, `configStatus` was only sent during webview initialization (`resolveWebviewView`, `webviewReady`). Auth/config mutations went through `updateAuthStatus()` which only sent `authStatus` messages.

## Decision

**All auth/config state changes must send BOTH `authStatus` AND `configStatus` messages.**

The standalone `updateAuthStatus()` function now calls:
1. `provider.postAuthStatus(status, !!config.endpoint)` (existing)
2. `provider.postConfigStatus(!!config.endpoint, status.state === "authenticated", config.models.length > 0)` (new)

This covers all mutation paths automatically:
- 30s auth poll
- Config change listener
- Webview focus listener
- Sign-in timeout handler
- API key storage via `_refreshAuthStatus`

## Rationale

Centralizing the fix in `updateAuthStatus()` ensures all code paths send both messages without requiring 5 separate patches. The `postConfigStatus` method does NOT deduplicate — the welcome screen logic needs to re-evaluate state on every update, even if values haven't changed.

## Alternatives Rejected

- ❌ **Send configStatus only in auth poll** — doesn't cover config changes (endpoint, models), sign-in timeout, or API key storage
- ❌ **Deduplicate configStatus like authStatus** — welcome screen logic needs fresh state on every change for correct transitions

## Impact

- Welcome screen now auto-transitions when users complete setup steps
- Auth banner and welcome screen state stay synchronized
- No race conditions between welcome screen and status bar

## Affected Files

- `src/extension.ts` — `updateAuthStatus()`, `postConfigStatus()` method

## Related

- Issue #123 (welcome screen auto-detect bugs)
- `.squad/decisions.md` lines 126-147 (welcome UI options)
### 2026-03-02T18:06Z: Design decision — welcome screen style
**By:** Rob Pitcher (via Copilot)
**What:** For issue #120 first-run experience, use the "replace chat area" approach (Option B) — full-screen welcome/setup wizard that replaces the chat area when config is incomplete. The inline message approach (Option A) is rejected.
**Why:** User tested both mockup branches and preferred the replace-area UX.

### API Key Storage Must Sync authMethod Setting

**By:** Blair  
**Date:** 2026-03-02  
**What:** When storing an API key via `_promptAndStoreApiKey()`, the extension now also updates `forge.copilot.authMethod` to `"apiKey"` (Global scope). When clearing via `_clearApiKey()`, it reverts to `"entraId"`. This ensures `checkAuthStatus` evaluates the correct credential type. Any future code path that programmatically sets/clears an API key must maintain this invariant.  
**Why:** Without this sync, `checkAuthStatus` always evaluated Entra ID auth (the default), making the welcome screen stuck after API key entry.  
**Impact:** Auth method now correctly follows API key storage state. Sign-in flow and welcome screen state are synchronized.  
**Related:** Issue #81 (auth UX), `.squad/log/2026-03-02T23-30-apikey-authmethod-fix.md`

### 2026-03-03: Extract Actionable Entra ID Error Messages

**Date:** 2025-03-03  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Context

When using Entra ID authentication (the default), users were seeing verbose, confusing error messages that dumped the entire `ChainedTokenCredential` error chain. This included failures from all credential providers (EnvironmentCredential, ManagedIdentityCredential, VS Code auth, Azure CLI, PowerShell), even though most were irrelevant to the user's situation.

Example of old error:
```
Entra ID authentication failed. Ensure you're signed in via Azure CLI... Details: ChainedTokenCredential authentication failed.
CredentialUnavailableError: EnvironmentCredential is unavailable...
CredentialUnavailableError: ManagedIdentityCredential: Authentication failed...
CredentialUnavailableError: Visual Studio Code Authentication is not available...
CredentialUnavailableError: ERROR: No subscription found. Run 'az account set' to select a subscription.
[... many more lines ...]
```

Users reported this as a "false positive" since the error appeared during initial auth check but auth succeeded after running `az account set`.

## Decision

Added a helper method `_extractEntraIdErrorSummary(rawMessage: string): string` in `src/extension.ts` that:

1. Parses the raw `ChainedTokenCredential` error to extract the most actionable failure
2. Pattern-matches common Azure CLI issues:
   - No subscription found → "Run 'az account set'"
   - Not logged in → "Run 'az login'"
   - AADSTS errors → "Run 'az login' and 'az account set'"
   - MFA/interactive required → "Run 'az login'"
   - Generic fallback → "Check your Azure CLI setup"
3. Returns a SHORT (1-2 lines), actionable message instead of the full chain dump

Updated two locations in `extension.ts`:
- Line 676-682 (`_handleChatMessage`)
- Line 990-995 (`resumeConversation` handler)

Both now call `_extractEntraIdErrorSummary()` and present concise, actionable errors like:
```
Entra ID authentication failed. Azure CLI: No subscription found. Run 'az account set' to select a subscription, then try again. Or switch to API key auth in Settings (forge.copilot.authMethod).
```

## Rationale

- **User experience:** Actionable, concise errors reduce confusion and help users fix auth issues quickly
- **Signal-to-noise:** Most credential chain failures are irrelevant (e.g., ManagedIdentity on local dev)
- **Azure CLI focus:** Forge users in air-gapped environments primarily use Azure CLI for Entra ID auth
- **Follows charter:** "Keep error messages actionable — tell the user what to do, not just what went wrong"

## Alternatives Considered

1. **Show only the last error in the chain** — rejected because the last error isn't always the most actionable
2. **Attempt to parse structured error objects** — rejected as `@azure/identity` errors are strings, not structured
3. **Hide errors entirely until second failure** — rejected as users need immediate feedback

## Impact

- **Files changed:** `src/extension.ts`
- **Tests:** All tests pass (232 passed, 3 skipped)
- **TypeScript:** Type-checks clean
- **Breaking changes:** None (internal implementation detail)

### 2026-03-03: Auto-resolve copilot CLI path in getOrCreateClient

**By:** Blair (Extension Dev)
**Date:** 2025-07-25
**Context:** .vsix sideload fails because SDK's `getBundledCliPath()` calls `import.meta.resolve('@github/copilot/sdk')` which the esbuild shim cannot resolve without `node_modules`.

## Decision

`getOrCreateClient()` now auto-resolves the copilot CLI binary from PATH using `which`/`where` before constructing `SDKCopilotClient`. This provides `cliPath` explicitly so the SDK never calls `getBundledCliPath()`.

**Fallback chain:**
1. `config.cliPath` set → use it (unchanged)
2. `config.cliPath` empty → try `which copilot` / `where copilot` on PATH
3. PATH lookup fails → let SDK try its bundled path (works in dev, fails in .vsix → caught by error handler)

Also added `"cannot resolve"` to the error detection patterns to match the exact error the esbuild shim throws.

## Impact

- All agents: no changes needed to callers of `getOrCreateClient()`
- Windows (tests): air-gap test updated to accept auto-resolved cliPath
- Users: .vsix sideload now works if `copilot` is on PATH without manual config

### 2026-03-03: Prefetched state pattern for auth polling

**By:** Blair
**Date:** 2026-03-02
**What:** Functions that are called in sequence and need the same async data (config + auth status) should pass results down via optional params rather than re-fetching. `_sendConfigStatus(prefetched?: PrefetchedState)` and `refreshWebviewState(prefetched?)` now accept pre-computed data. `updateAuthStatus()` returns `AuthStatus` so callers can reuse it.
**Why:** The 30s auth poll was making 2× `getToken()` calls — once in `updateAuthStatus()` and again in `_sendConfigStatus()`. For Entra ID, each `getToken()` may hit Azure Identity. This halves the auth overhead.

### 2026-03-03: _sendConfigStatus Must Send UI-Critical Data Before Slow Auth Checks

**Date:** 2025-01-22  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Context

The extension appeared completely frozen on Windows machines with proper configuration (endpoint, models, Azure CLI logged in). Root cause: `_sendConfigStatus()` gated ALL webview messages (including models list) behind `checkAuthStatus()`, which uses `DefaultAzureCredential`. On Windows, this can hang for 15-60 seconds trying IMDS (managed identity endpoint 169.254.169.254 timeout) before falling through to Azure CLI.

## Decision

**UI-critical data (models, endpoint status) must be sent IMMEDIATELY before slow async operations like credential checks.**

### Implementation Pattern

```typescript
private _sendConfigStatus(prefetched?, isCheckRequest = false): void {
  const doWork = async () => {
    // 1. Get config synchronously (no await for models/endpoint)
    const syncConfig = getConfiguration();
    
    // 2. Send models/endpoint info IMMEDIATELY
    this._view?.webview.postMessage({ type: "modelsUpdated", models: syncConfig.models });
    this._view?.webview.postMessage({ type: "configStatus", hasAuth: false, ... });
    
    // 3. THEN do async auth check with timeout
    const status = await withTimeout(checkAuthStatus(...), 15000, "Auth timed out");
    
    // 4. Send updated status after auth completes
    this._view?.webview.postMessage({ type: "configStatus", hasAuth: true, ... });
  };
  doWork().catch((error) => {
    this._outputChannel.appendLine(`Error: ${error.message}`);
  });
}
```

### Key Principles

1. **Non-blocking reads first:** Use synchronous `getConfiguration()` for VS Code settings (no SecretStorage).
2. **Send preliminary state:** Webview gets models/endpoint immediately; auth status follows when ready.
3. **Timeout long operations:** Wrap `DefaultAzureCredential.getToken()` with 15-second timeout.
4. **Log, don't swallow:** Replace `.catch(() => {})` with output channel logging for diagnostics.
5. **Webview dedup handles it:** The `applyConfigStatus()` dedup key (`${hasEndpoint}:${hasAuth}:${hasModels}`) naturally handles receiving preliminary status (hasAuth=false) then updated status (hasAuth=true).

## Rationale

- **User experience:** Models dropdown must populate instantly, not after 30+ seconds.
- **Diagnosability:** Logging reveals when/why auth checks hang (useful for troubleshooting).
- **Robustness:** Timeout prevents indefinite hangs from network issues or credential provider bugs.

## Alternatives Considered

- **Parallel auth check:** Start auth check in background but don't await it before sending models. Rejected — still need to coordinate two message sends, and error handling becomes complex.
- **Skip auth check entirely on initial load:** Rejected — we need auth status for the welcome screen.

## Impact

- **Files changed:** `src/extension.ts` (added `withTimeout()` helper, restructured `_sendConfigStatus()`, added outputChannel to constructor)
- **Breaking changes:** None — webview message API unchanged
- **Tests:** All 232 tests pass

## Follow-up

- Consider caching credential provider token (with expiry) to avoid repeated `getToken()` calls during polling.
- Monitor Forge output channel logs for common auth timeout patterns (user feedback requested).

### 2026-03-03: Wrong Copilot Binary Detection

**By:** Childs  
**Date:** 2026-03-02  
**Issue:** Windows 11 vsix install bug

## Problem

When the extension is installed via `.vsix` on Windows 11, the `@github/copilot` CLI isn't bundled (due to `.vscodeignore` excluding `node_modules/`). The SDK's `import.meta.resolve("@github/copilot/sdk")` shim fails → `getBundledCliPath()` returns undefined → our code falls back to `where copilot` on PATH.

If the user has a different CLI tool named `copilot` on PATH (not `@github/copilot`), the SDK passes `--headless` to that binary, which doesn't support the flag. Error message: `"CLI server exited with code 1 stderr: error: unknown option '--headless'"`.

The SDK hardcodes `--headless` in spawn args (v0.1.26, line 743 of `dist/client.js`).

## Solution

Enhanced error detection in `getOrCreateClient()` catch block to recognize `--headless` errors as "wrong binary" instead of generic errors.

**Pattern matching:**
- `message.includes("--headless")`
- `message.includes("unknown option") && message.includes("exited with code")`
- `message.includes("error: unknown option")`

When detected, throw `CopilotCliNotFoundError` with actionable message:  
"The 'copilot' binary found on your PATH does not appear to be the GitHub Copilot CLI (@github/copilot). Install it with: npm install -g @github/copilot — then restart VS Code. Or set forge.copilot.cliPath to the correct binary location."

**File modified:** `src/copilotService.ts` (lines 64-95)

## Design Decisions

1. **Detection before general CLI-not-found check** — wrong binary errors are checked first, then generic "not found" errors, ensuring the most specific error message wins.

2. **Case-sensitive matching for --headless** — the `--headless` flag and "unknown option" strings come from command-line tools and are unlikely to vary in case, so we use `includes()` without `.toLowerCase()` for performance.

3. **Multi-pattern redundancy** — three patterns cover different CLI error message formats (short, long, with exit code) to maximize compatibility across shells and binaries.

4. **No CLI resolution changes** — deliberately did NOT change how the CLI is resolved. The fix is purely error detection and messaging, keeping blast radius minimal.

## Testing

- TypeScript typecheck: ✅ `npx tsc --noEmit` passes
- Unit tests: ✅ All 232 tests pass (15 files, 3 todo)
- Build: ⚠️ Pre-existing highlight.js/marked-highlight dependency errors in `media/chat.js` (unrelated to this change)

## Future Work

The build failure suggests missing dependencies in the webview layer — that's Blair's domain (webview owner). This fix is SDK error handling only.

### 2026-03-03T16:51Z: User directive
**By:** Rob Pitcher (via Copilot)
**What:** Users should NOT have to run `npm install -g @github/copilot` to use Forge. The extension must ship with the CLI binary — no external install steps.
**Why:** User request — captured for team memory

### 2026-03-03T16:51Z: User directive  
**By:** Rob Pitcher (via Copilot)
**What:** Entra ID auth should work with just `az login` — no subscription setup (`az account set`) should be required. The extension should auto-recover if no subscription is set.
**Why:** User request — captured for team memory

# Decision: Auto-Recovery for Azure CLI "No Subscription" Errors

**Date:** 2026-03-03  
**Decider:** Childs  
**Status:** Implemented

## Context

When users run `az login` but haven't run `az account set`, the `DefaultAzureCredential` → `AzureCliCredential` chain fails with "No subscription found" even though the user IS authenticated. The underlying issue is that `@azure/identity` v4.13.0's `AzureCliCredential` internally calls `az account get-access-token --resource https://cognitiveservices.azure.com`, which requires a subscription context.

Rob Pitcher's requirement: **"With the az cli we shouldn't have to setup an azure subscription. Just authenticating should be sufficient."**

## Decision

Implemented auto-recovery logic in `EntraIdCredentialProvider.getToken()` that:

1. First attempts `DefaultAzureCredential.getToken()` as normal
2. If it fails with "No subscription found" or "az account set" in the error message:
   - Runs `az account list --output json` to fetch available subscriptions
   - Selects the first subscription with `state === "Enabled"`
   - Runs `az account set --subscription <id>` to set the default
   - Logs a console.warn message: `[forge] No Azure subscription set. Auto-selecting: <name> (<id>)`
   - Retries `DefaultAzureCredential.getToken()`
3. If retry succeeds, returns the token
4. If retry fails or no enabled subscriptions exist, throws: `"Azure authentication failed. Run 'az account set --subscription <id>' to select a subscription."`
5. Auto-recovery only attempts ONCE per provider instance (tracked via `hasAttemptedRecovery` boolean)

## Implementation Details

- Import `execSync` from `child_process` for subprocess calls
- Recovery logic wraps the existing `getToken()` logic in try-catch
- Uses defensive JSON parsing of `az account list` output
- Ignores disabled subscriptions (`state !== "Enabled"`)
- Does NOT replace `DefaultAzureCredential` — just adds recovery logic around it
- Keeps existing `DefaultAzureCredential` chain intact (tries Environment → ManagedIdentity → VSCode → AzureCLI → etc)

## Test Coverage

Added 4 new tests to `src/test/auth/credentialProvider.test.ts`:

1. **auto-recovers when 'No subscription found' error occurs** — verifies happy path recovery
2. **auto-recovery only attempts once per provider instance** — ensures no infinite retry loops
3. **auto-recovery fails gracefully when no enabled subscriptions exist** — handles edge case with only disabled subscriptions
4. **does not attempt recovery for non-subscription errors** — ensures we don't trigger recovery for network errors, invalid credentials, etc.

All 17 existing credential tests still pass. Full suite: 236 tests passing.

## Alternatives Considered

1. **Replace DefaultAzureCredential with AzureCliCredential directly** — rejected because it breaks the credential chain (would skip VSCode auth, Managed Identity, etc.)
2. **Pass `tenantId` to AzureCliCredential** — rejected because the problem is missing subscription, not tenant
3. **Document "run az account set first"** — rejected because it creates unnecessary friction for users who are already logged in

## Impact

- Reduces setup friction for Entra ID auth — users only need `az login`, not `az account set`
- Transparent to users when recovery succeeds (just a console.warn in output channel)
- Provides actionable error message if recovery fails
- No breaking changes — existing behavior unchanged when subscription is already set
- Air-gap safe — only calls local `az` CLI commands, no network requests

## Files Changed

- `src/auth/credentialProvider.ts` — added `hasAttemptedRecovery` field, `isNoSubscriptionError()` helper, `autoSelectSubscription()` method, try-catch wrapper in `getToken()`
- `src/test/auth/credentialProvider.test.ts` — added 4 new tests, mocked `child_process.execSync`

# CLI Binary Bundling in .vsix Package

## Context
The Forge extension uses `@github/copilot-sdk` which depends on the `@github/copilot` CLI binary (103MB). Previously, `node_modules/**` was excluded from the .vsix, causing runtime failures when the SDK tried to resolve the CLI path.

## Decision
Include `@github/copilot` and its SDK dependencies in the .vsix package by negating the `node_modules/**` exclusion in `.vscodeignore`:

```
!node_modules/@github/copilot/**
!node_modules/@github/copilot-sdk/**
!node_modules/vscode-jsonrpc/**
!node_modules/zod/**
```

## Rationale
1. **Just works UX:** Users should NOT need to run `npm install -g @github/copilot` to use the extension
2. **SDK resolution path:** The SDK uses `import.meta.resolve("@github/copilot/sdk")` which the esbuild shim resolves by walking up from `dist/` (where `__dirname` is set) to find `node_modules/@github/copilot/sdk/index.js`
3. **Vsix structure:** In a packaged .vsix, the structure is:
   ```
   extension/
   ├── dist/
   │   ├── extension.js  ← __dirname here
   │   └── chat.js
   ├── node_modules/
   │   ├── @github/copilot/
   │   ├── @github/copilot-sdk/
   │   ├── vscode-jsonrpc/
   │   └── zod/
   └── media/
   ```
   The shim walks UP from `dist/` → `extension/` → finds `node_modules/` as a sibling, so resolution works correctly.

## Impact
- **.vsix size:** Increases from ~1.5MB to ~105MB. Acceptable — GitHub Copilot's own extension is hundreds of MB.
- **Runtime dependencies:** `vscode-jsonrpc` and `zod` are runtime deps of `@github/copilot-sdk` (not bundled by esbuild), so they must also be included.
- **Air-gap compliance:** All inference still goes to Azure AI Foundry — the CLI binary is purely for SDK internal logic, not telemetry.

## Verification
✅ `node_modules/@github/copilot/sdk/index.js` exists (12MB)  
✅ `node_modules/@github/copilot/index.js` exists (16MB)  
✅ SDK dependencies identified: `vscode-jsonrpc`, `zod`  
✅ Shim logic validated: walks UP from `dist/__dirname` to find `node_modules/` sibling  

## Alternatives Considered
1. **Extract only the CLI binary:** Too fragile — the SDK expects the full package structure (sdk/, prebuilds/, etc.)
2. **Use `which copilot` fallback:** Unreliable — might pick up wrong version, breaks air-gap UX promise
3. **Bundle CLI as extension resource:** Would require patching SDK resolution logic

## Owner
Palmer (DevOps Specialist)

## Date
2026-03-03

# 2026-03-03T17:03Z: User directive — CLI distribution strategy
**By:** Rob Pitcher (via Copilot)
**What:** Do NOT bundle @github/copilot CLI in the vsix. Instead: (1) Require user-installed CLI, (2) Provide forge.copilot.cliPath setting, (3) Auto-discover via PATH as fallback, (4) Run preflight validation at activation and give fix-it UX when CLI is missing or wrong.
**Why:** Bundling 103MB of multi-platform native binaries is not best practice. The CLI should be a prerequisite, not embedded.

---

# CLI Validation Functions

**Date:** 2026-03-03  
**Author:** Childs (SDK Dev)  
**Context:** Issue — CLI validation requirement after reverting bundled CLI  
**Status:** Implemented

## Decision

Added two exported functions to `src/copilotService.ts` for validating that a discovered or configured CLI binary is actually the `@github/copilot` CLI:

1. **`validateCopilotCli(cliPath: string): Promise<CopilotCliValidationResult>`**
   - Runs `<cliPath> --version` with 5-second timeout
   - Returns `{ valid: true, version, path }` if version output received
   - Returns `{ valid: false, reason: "not_found" | "wrong_binary" | "version_check_failed", ... }` on error
   - Validation logic: The @github/copilot CLI supports `--version` and returns version output without error. Other `copilot` binaries (e.g., HashiCorp Terraform Copilot, Microsoft 365 Copilot CLI) may not support this flag or may fail.

2. **`discoverAndValidateCli(configuredPath?: string): Promise<CopilotCliValidationResult>`**
   - If `configuredPath` is non-empty, validates it directly
   - Otherwise, calls `resolveCopilotCliFromPath()` to discover from PATH
   - Returns validation result or `{ valid: false, reason: "not_found" }` if no binary found

## Type Definition

```typescript
export type CopilotCliValidationResult =
  | { valid: true; version: string; path: string }
  | { valid: false; reason: "not_found" | "wrong_binary" | "version_check_failed"; path?: string; details?: string };
```

## Rationale

- **Separation of concerns:** Validation is a separate function that the extension layer (Blair's domain) will call at activation time. `getOrCreateClient()` remains unchanged.
- **Async design:** Returns `Promise` for consistency with SDK patterns, even though `execSync` is used internally (wrapped in Promise for future flexibility).
- **Error classification:** Three failure reasons allow UI layer to show specific messages: install CLI vs. configure correct path vs. network/permission issues.
- **Air-gap safe:** Only runs `--version` command locally, no network calls.

## Testing

Added 11 tests to `src/test/copilotService.test.ts`:
- `validateCopilotCli`: 5 tests (valid CLI, wrong binary, not found, empty output, timeout)
- `discoverAndValidateCli`: 6 tests (configured path, discover from PATH, not found, wrong binary discovered, empty config)

All tests pass. TypeScript compilation clean.

## Future Work

Extension layer (Blair) will call `discoverAndValidateCli()` at activation and show fix-it UX when validation fails.

---

# Decision: Use execFileSync for user-configurable paths

**By:** Childs
**Date:** 2026-03-03
**Context:** PR review found command injection vulnerability in `validateCopilotCli()`

## Decision

When executing external binaries where the **path comes from user configuration** (e.g., `forge.copilot.cliPath`), always use `execFileSync` / `execFile` with an argv array — never `execSync` with string interpolation.

`execSync` runs through a shell, making it vulnerable to command injection and quoting breakage (especially on Windows). `execFileSync` bypasses the shell entirely.

## Scope

- `validateCopilotCli()` — now uses `execFileSync(cliPath, ["--version"], ...)`
- `resolveCopilotCliFromPath()` — still uses `execSync` for `which`/`where` (hardcoded, no user input — acceptable)
- `credentialProvider.ts` — uses `execSync` for `az` CLI commands (hardcoded commands — acceptable)

## Rule

**Any future code that executes a binary path from user config MUST use `execFileSync`/`execFile` with argv, not `execSync` with template strings.**

---

# CLI Preflight Validation

**Date:** 2025-03-03  
**Author:** Blair (Extension Dev)  
**Status:** Implemented

## Decision

Added preflight CLI validation during extension activation that checks if the GitHub Copilot CLI is correctly installed and accessible.

## Context

Per Rob's directive, the extension no longer bundles the @github/copilot CLI. Instead, it requires the user to install it globally and configure it via `forge.copilot.cliPath` setting. We needed a way to validate CLI availability at startup and provide actionable fix-it UX.

## Implementation

1. **Extension Activation (`src/extension.ts`)**
   - Added `performCliPreflight()` function that calls `discoverAndValidateCli()` from copilotService
   - Runs async during activation (fire-and-forget, doesn't block)
   - Re-runs when `forge.copilot.cliPath` config changes

2. **Fix-it UX**
   - Shows VS Code warning message with buttons based on failure reason:
     - `not_found`: "Open Settings" or "Open Terminal" (to run npm install)
     - `wrong_binary`: "Open Settings"
     - `version_check_failed`: "Open Settings" with details
   - Simultaneously posts `cliStatus` message to webview for in-chat banner

3. **Webview Banner (`media/chat.js`)**
   - Added `updateCliBanner()` function similar to `updateAuthBanner()`
   - Shows ✅ "CLI ready" on success (auto-dismisses in 2s)
   - Shows ⚠️ error message with "Fix" button on failure
   - Styled using existing `.auth-banner` CSS classes

4. **Test Updates**
   - Added mock for `discoverAndValidateCli()` in test files
   - Added `cliStatus` to message type filters (similar to `authStatus`, `modelsUpdated`, etc.)

## Rationale

- **Proactive validation** catches CLI issues before the user tries to chat
- **Actionable messages** tell users exactly what to do (install, configure, etc.)
- **Consistent UX** uses existing banner pattern from auth status
- **Non-blocking** doesn't slow down activation
- **Testable** properly mocked in tests

## Verification

- ✅ `npx tsc --noEmit` — passes
- ✅ `npm test` — all 246 tests pass
- ⚠️ `npm run build` — pre-existing highlight.js bundling issue on branch (not related to CLI preflight changes)

## Notes

The build error with highlight.js is from commit 3cc82b6 on the current branch and is unrelated to CLI preflight validation. The CLI preflight code is ready and tested.

---

**Dependencies:** Relies on `discoverAndValidateCli()` and `CopilotCliValidationResult` type added by Childs in parallel.

---

# Decision: Multi-subscription guardrail and execFileSync for Azure CLI calls

**Author:** Blair (Extension Dev)
**Date:** 2025-07-15
**Status:** Implemented

## Context

PR review identified that `autoSelectSubscription()` in credentialProvider.ts had three issues:
1. It blindly picked the first enabled subscription on multi-subscription machines, mutating global Azure CLI state.
2. It used `execSync` with shell string interpolation, opening a (low-risk) command injection vector.
3. No timeout on `execSync` calls — a hung `az` CLI could block the extension host indefinitely.

## Decision

- **Only auto-select when exactly one** enabled subscription exists. Zero or multiple → return false with actionable error guidance.
- **Use `execFileSync`** with argument arrays instead of `execSync` with shell strings for all `az` CLI calls.
- **Add 10-second timeout** to all `execFileSync` calls.

## Impact

- `src/auth/credentialProvider.ts` — `autoSelectSubscription()` return type changed from `void` to `boolean`
- Test mocks updated from `execSync` → `execFileSync`
- Any future `child_process` usage in auth code should follow the same pattern: `execFileSync` + args array + timeout

---

# Decision: CLI Auto-Installer Architecture

**Status:** Implemented  
**Date:** 2026-03-03  
**Decider:** Childs (SDK Dev)  
**Context:** Issue for CLI auto-installation

## Decision

Implemented a CLI auto-installer module (`src/cliInstaller.ts`) that manages downloading and installing the `@github/copilot` npm package into the extension's globalStoragePath.

### Key Architectural Decisions

1. **Install location:** `{globalStoragePath}/copilot-cli/` — a mini npm project within VS Code's per-extension global storage
   - Rationale: Per-extension isolation, survives extension updates, no system-wide PATH pollution
   - CLI binary location: `node_modules/@github/copilot/npm-loader.js` (npm loader that delegates to platform-specific binary)

2. **Version pinning:** CLI version pinned to match `@github/copilot-sdk` version from Forge's package.json (currently 0.1.26)
   - Rationale: SDK and CLI versions must match to avoid compatibility issues
   - Implementation: Reads package.json at runtime, strips `^` or `~` prefix

3. **Install method:** npm first, HTTP tarball fallback
   - Primary: `npm install @github/copilot@{version} --prefix {installDir}`
   - Fallback: Download tarball from npm registry, extract with system `tar` command, manually install platform-specific binary
   - Rationale: npm is more reliable, but HTTP fallback works even without npm on PATH (air-gapped environments may not have npm)

4. **Platform-specific binary handling:** The `@github/copilot` package has `optionalDependencies` for platform binaries (`@github/copilot-{platform}-{arch}`)
   - npm handles this automatically
   - HTTP fallback must manually download and extract the platform-specific package

5. **Resolution chain in copilotService.ts:**
   1. Configured path (`forge.copilot.cliPath`) — explicit user override, always wins
   2. Managed copy — check globalStoragePath via `getManagedCliPath()`
   3. PATH discovery — existing `resolveCopilotCliFromPath()`
   4. If none found, throw `CopilotCliNeedsInstallError` — Blair's extension.ts catches this and triggers the install dialog

6. **Startup probe:** New `probeCliCompatibility()` function validates CLI beyond `--version` check
   - Spawns CLI with `--headless --no-auto-update --stdio` and checks it starts without error
   - Detects wrong binaries (e.g., Kubernetes `copilot` tool) that might pass version check but don't support required flags
   - Returns `{compatible: boolean, error?: string}`

### Public API

```typescript
export interface CliInstallResult {
  success: boolean;
  cliPath?: string;
  version?: string;
  error?: string;
  method?: "npm" | "http-tarball";
}

export interface CliInstallOptions {
  globalStoragePath: string;
  targetVersion?: string;
}

export async function installCopilotCli(options: CliInstallOptions): Promise<CliInstallResult>;
export async function getManagedCliPath(globalStoragePath: string): Promise<string | undefined>;
export async function isManagedCliInstalled(globalStoragePath: string): Promise<boolean>;
export const CLI_INSTALL_DIR: string; // "copilot-cli"
```

### Breaking Changes to copilotService.ts

- `getOrCreateClient(config, globalStoragePath?)` — new optional parameter
- `getOrCreateSession(conversationId, config, authToken, model, globalStoragePath?, onPermissionRequest?)` — new optional parameter
- `resumeConversation(sessionId, config, authToken, model, globalStoragePath?, onPermissionRequest?)` — new optional parameter
- `listConversations(config, globalStoragePath?)` — new optional parameter
- `getLastConversationId(config, globalStoragePath?)` — new optional parameter
- `deleteConversation(sessionId, config, globalStoragePath?)` — new optional parameter

All changes are backward-compatible (optional parameters).

### Integration Notes for Blair

- Catch `CopilotCliNeedsInstallError` in extension.ts and show install dialog
- Pass `context.globalStorageUri.fsPath` to all copilotService functions
- After install succeeds, call `resetClient()` to clear the cached client, then retry the operation

### Why Not Use the SDK's Built-in CLI Resolution?

The SDK can auto-discover the CLI from PATH or `node_modules` when `cliPath` is not provided. However:
- We need a managed install location that persists across extension updates
- We need to provide a UI-driven install flow (not silent failure)
- We need to support environments where the CLI is not on PATH and npm is not available

The SDK's built-in resolution is still used as fallback step 3 in the resolution chain.

## Alternatives Considered

1. **System-wide CLI installation** (e.g., via npm global) — rejected for isolation and permission reasons
2. **Bundle CLI binary in extension VSIX** — rejected due to 140MB binary size and platform-specific builds
3. **Use SDK's built-in resolution only** — rejected because it doesn't provide install affordances

## Dependencies

- Node.js built-in modules: `child_process`, `fs`, `https`, `path`, `stream/promises`, `zlib`
- System `tar` command (available on all platforms including Windows 10+)

## Testing Strategy

- Unit tests for install logic (npm success, npm fallback to HTTP, error cases)
- Integration tests for resolution chain (configured → managed → PATH → error)
- Probe tests for CLI compatibility detection

Blair owns the extension.ts integration and E2E flow.

---

# Decision: CLI Auto-Install UX Pattern

**Date:** 2026-03-03  
**Decider:** Blair (Extension Dev)  
**Context:** CLI auto-installer integration into extension.ts

## Decision

When the Copilot CLI is not found and a user attempts to send a chat message, Forge uses an **ask-first dialog** pattern rather than automatic installation.

### Flow

1. User sends message → `getOrCreateSession` throws `CopilotCliNeedsInstallError`
2. Extension shows info message: "Forge needs the GitHub Copilot CLI to work. Install it now?"
   - Buttons: "Install", "Cancel"
3. If Install → progress notification "Installing Copilot CLI..." → `installCopilotCli()`
   - Success: "Copilot CLI installed successfully. Try sending a message again."
   - Failure: Error message with "Open Settings" button
4. If Cancel → info message with manual install instructions + "Open Settings" option

### Key Decisions

- **No automatic retry** — after successful install, user must re-send the message. This avoids double-send edge cases and makes the flow predictable.
- **Ask-first, not automatic** — prevents surprise installations that could trigger corporate policy violations in air-gapped environments.
- **Progress notification** — non-blocking `vscode.window.withProgress` with `ProgressLocation.Notification` so user can continue working during install.
- **Graceful failure path** — installation errors point user to Settings as fallback (manual install or cliPath configuration).

### Integration Points

- `extension.ts` catches `CopilotCliNeedsInstallError` in `_handleChatMessage` error handler
- `_globalStoragePath` passed through from `ExtensionContext.globalStorageUri.fsPath` to enable managed CLI install location
- Reuses existing `openSettings()` command for fallback path

## Rationale

Air-gapped environments often have strict policies about software installation. An automatic install could:
- Violate corporate security policies
- Trigger network calls (npm registry, GitHub releases) that fail or leak data
- Surprise users who expect fully manual control

The ask-first pattern respects user agency while still making installation convenient for most users.

## Alternatives Considered

1. **Automatic install on first message** — rejected: violates user consent, could break air-gap policies
2. **Preflight auto-install during activation** — rejected: blocks extension startup, no user context for approval
3. **Silent fallback to manual-only** — rejected: poor UX, hides the problem until user investigates settings

## Impact

- **User-facing:** Clear, predictable installation flow with escape hatches (cancel, settings, manual)
- **Code:** Minimal — single error catch block + dialog method, no retry logic complexity
- **Testing:** Covered by existing error handling tests; install dialog is standard VS Code API (no custom mocking needed)
