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

## Decision

**Triage complete on all 23 MVP milestone issues.** 8 issues rerouted to @copilot (Coding Agent) via label swap; 15 issues confirmed with current squad assignments.

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

## Rationale

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

## What This Enables

1. **Parallel execution** — @copilot can start on 8 issues immediately via heartbeat workflow
2. **Reduced cognitive load** — squad members focus on high-value architecture and testing work
3. **Clear ownership** — each issue has a single owner (via `squad:*` label)
4. **Flexible reassignment** — swapping labels is the standard mechanism for handoff

---

## Known Risks

1. **Issue #6 (Settings Schema)** — flagged as 🟡; code already exists in `package.json` lines 36-64. @copilot should validate compliance with PRD Table FR6, not rewrite. PR review recommended.
2. **Auto-assign cadence** — @copilot picks up work via periodic heartbeat. If urgent, manually assign via GitHub UI.
3. **@copilot context limits** — large issues (e.g., #18 README) may require multiple turns. Monitor for incomplete work.

---

## Next Steps

1. **@copilot**: Auto-assign workflow will pick up 8 rerouted issues based on priority and dependencies
2. **Squad members**: Begin work on confirmed assignments in dependency order
3. **MacReady**: Monitor @copilot PR quality; escalate to squad if issues arise
4. **Scribe**: Merge this decision into `.squad/decisions.md` (append-only)

---

## References

- Coordinator routing analysis: `.squad/decisions/inbox/coordinator-mvp-routing.md` (assumed context)
- PRD: `specs/PRD-airgapped-copilot-vscode-extension.md`
- Team roster: `.squad/team.md`
- Project history: `.squad/agents/macready/history.md`

---

# Dependency Mapping & Sprint Assignment Decision

**Date:** 2026-02-27  
**Author:** Childs (SDK Dev)  
**Context:** Rob Pitcher requested dependency links on all 28 issues and Sprint field values on Project #8

---

## Decision

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

## Rationale

- **Dependency format** uses `**Dependencies:** #X, #Y` prepended with a horizontal rule separator, keeping existing body content intact.
- **Sprint 1 contains all MVP work** — this mirrors the PRD critical path where all core functionality, testing, packaging, and documentation must land in the first iteration.
- **Post-MVP phases get their own sprints** — keeps roadmap items visible but clearly deferred.

---

## API Details

- **Project ID:** `PVT_kwHOANBAvc4BQSxx`
- **Sprint Field ID:** `PVTIF_lAHOANBAvc4BQSxxzg-dMUk`
- **Sprint 1 Iteration ID:** `09d998ce`
- **Sprint 2 Iteration ID:** `3ac56f5d`
- **Sprint 3 Iteration ID:** `59011026`
- **Iteration creation:** Not available via GraphQL API; must use GitHub Projects UI

---

## Next Steps

1. **MacReady:** Create Sprint 4 and Sprint 5 in GitHub Projects UI, reassign #28 and #29
2. **Squad:** Use dependency links to determine work order — start with issues that have no pending dependencies
3. **Scribe:** Merge this decision into `.squad/decisions.md`

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

#### Rationale

- `.squad/` contains dev-only team state (agent charters, orchestration logs, decisions, casting, skills). This should not ship to `main` or be visible to end users.
- Using `git rm --cached` removes files from git tracking on the release branch without deleting them from the local worktree, so squad tooling continues to work on dev.
- `.gitignore` update prevents accidental re-addition of `.squad/` on the release branch.
- `.github/agents/` is kept because it configures GitHub's Copilot agent recognition — this is user-facing, not dev tooling.

#### What This Enables

1. Clean `main` branch without dev tooling artifacts
2. `squad-heartbeat.yml` cron workflow for @copilot auto-assignment
3. CI and release workflows on main
4. Repeatable process for future releases (rel/0.3.0, etc.)

**Why:** Implements Rob Pitcher's branching directive for the first release.

---

# Air-Gap Validation Testing Strategy

**Date:** 2026-02-27  
**Author:** Windows (Tester)  
**Context:** Issue #11 — Test air-gap validation (SC2, SC3)

---

## Decision

Air-gap validation cannot be tested through manual network disconnection in unit tests. Instead, implemented **static code analysis and configuration inspection tests** that verify:

1. **Source code analysis**: All source modules (configuration.ts, copilotService.ts, extension.ts) are free of GitHub API endpoint references
2. **No GitHub authentication**: No GITHUB_TOKEN environment variable access or GitHub-specific configuration
3. **Azure-only endpoint**: CopilotClient sessions are configured exclusively with user-provided Azure AI Foundry endpoint
4. **No external HTTP calls**: Source code contains no direct fetch/axios/http.request calls (only SDK usage)
5. **Settings schema**: Extension contributes only enclave.copilot.* settings with no GitHub-related properties
6. **Provider type**: Sessions use OpenAI-compatible provider with Azure baseUrl

---

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

## Rationale

**Why static analysis over dynamic network testing:**
- Unit tests run in Node.js process without real VS Code environment
- Simulating network disconnection is unreliable and non-portable
- Static analysis catches violations at test time, not runtime
- Prevents accidental introduction of GitHub API dependencies in future changes
- Validates architecture intent: extension is designed for air-gap, not just works in air-gap

**What we validate:**
- ✅ Code doesn't reference GitHub endpoints (string matching on function source)
- ✅ Configuration reads only from enclave.copilot.* namespace
- ✅ Session config passes only Azure endpoint to SDK
- ✅ No HTTP libraries imported for direct calls

**What we don't validate:**
- ❌ Actual network traffic (requires integration test with real environment)
- ❌ SDK internal behavior (SDK is external dependency; we trust it honors provider config)
- ❌ VS Code platform network isolation (manual test responsibility)

---

## What This Enables

1. **Regression protection**: If someone adds `fetch("https://api.github.com/...")`, tests fail
2. **Architectural compliance**: Enforces design constraint that extension is Azure-only
3. **Continuous validation**: Runs in CI on every commit
4. **Documentation as code**: Tests serve as executable specification of air-gap requirements

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

## Decision

Created and merged two comprehensive documentation files addressing air-gapped environment setup and Azure configuration:

1. **`docs/installation-guide.md`** — Copilot CLI v0.0.418+ installation for disconnected environments
2. **`docs/configuration-reference.md`** — Complete Azure AI Foundry endpoint and extension settings reference

Both documents are complete, in-scope for MVP acceptance criteria, and ready for team review.

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

## Decision

Implemented three-tier session cleanup strategy for CopilotClient:

1. **destroySession(conversationId)** — Graceful single-session cleanup
   - Calls `session.abort()` with error handling (session may already be ended)
   - Removes from Map after abort
   - Logs warnings but doesn't throw

2. **destroyAllSessions()** — Concurrent cleanup for deactivation
   - Iterates all sessions, aborts in parallel via `Promise.all()`
   - Each abort is wrapped in `.catch()` to prevent one failure from blocking others
   - Added safety guard: skips undefined sessions (edge case from concurrent removal)
   - Clears Map after all aborts complete

3. **getSessionCount()** — Debugging/testing utility
   - Returns `sessions.size` for session tracking verification

**Integration points:**
- `stopClient()` now calls `destroyAllSessions()` before `client.stop()`
- Extension error handler calls `destroySession()` instead of `removeSession()` for proper cleanup
- `deactivate()` relies on `stopClient()` — no additional changes needed

---

## Rationale

### Why graceful error handling?
The SDK's `session.abort()` throws if the session has already ended or is in an invalid state. Since cleanup may be triggered from error paths, cancellation, or deactivation, we can't assume session state. Catching and logging prevents cleanup failures from cascading.

### Why concurrent abort in destroyAllSessions()?
Extension deactivation should be fast — blocking on sequential session cleanup would delay shutdown. `Promise.all()` parallelizes aborts while still ensuring all complete before clearing the Map.

### Why keep removeSession() separate?
`removeSession()` is a lightweight Map deletion without abort. It's still useful for test teardown or scenarios where the session was already disposed by other means. `destroySession()` is the new default for production cleanup.

### Why the undefined session guard?
Test discovered edge case: if a session is removed from the Map (via `removeSession()`) while another operation is iterating the Map, the iterator may encounter undefined values. While unlikely in production, the guard makes cleanup robust against race conditions.

---

## What This Enables

1. **No session memory leaks** — sessions are properly aborted and removed on error or deactivation
2. **Graceful deactivation** — extension can be deactivated mid-stream without errors
3. **Testable session lifecycle** — `getSessionCount()` allows verification in tests
4. **Future session lifecycle features** — foundation for periodic stale session cleanup (deferred to post-MVP)

---

## What This Doesn't Solve

- **No automatic conversation-end detection** — VS Code Chat API doesn't expose conversation close events. Sessions remain in memory until error or deactivation. Issue #24 (ChatContext ID reliability) may inform future cleanup triggers.
- **No session timeout** — sessions persist indefinitely if no errors occur. Periodic cleanup (e.g., TTL-based) is deferred to post-MVP hardening.

---

## Testing

All 59 existing tests pass. Session cleanup is exercised in:
- `multi-turn.test.ts` — `afterEach()` calls `stopClient()` → `destroyAllSessions()`
- `copilotService.test.ts` — validates session removal and client stop behavior

Mock update: `abort: vi.fn().mockResolvedValue(undefined)` — required for async abort compatibility.

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

#### Pros
- **Air-gapped compatible:** Zero external dependencies
- **More screen real estate:** Full editor area instead of sidebar
- **Simpler than sidebar:** No activity bar icon contribution needed

#### Cons
- **Poor UX for chat:** Chat should be persistent sidebar, not a tab
- **Competes with editor:** Takes focus away from code
- **Less "native" feel:** Webview panels are for tools/visualizations, not persistent chat
- **User must manually open:** No "always available" sidebar presence

#### Implementation Details
Similar to Option 1, but simpler `package.json` (no viewsContainers) and use `createWebviewPanel` instead of `registerWebviewViewProvider`.

**Complexity:** Moderate — 2 days

**Recommendation:** ❌ Not recommended — UX is worse than sidebar for a chat assistant

### Option 3: Native VS Code TreeView + QuickInput

**Description:** Use TreeView for message history, QuickInput for prompt input.

#### Pros
- **Air-gapped compatible:** Zero external dependencies
- **Native performance:** No webview overhead
- **Theme-aware:** Automatic VS Code theming

#### Cons
- **❌ Poor chat UX:** TreeView is for hierarchical data, not conversational UI
- **❌ No markdown rendering:** Cannot display formatted code, syntax highlighting, etc.
- **❌ Limited styling:** Cannot create a proper chat bubble interface
- **❌ Streaming very difficult:** Would need to update tree nodes on every token delta

**Recommendation:** ❌ Not viable — TreeView is fundamentally wrong UI pattern for chat

### Option 4: Terminal-based UI

**Description:** Render chat in an integrated terminal.

#### Pros
- **Air-gapped compatible:** Zero external dependencies
- **Simple implementation:** Just write to terminal output

#### Cons
- **❌ Terrible UX:** No scrollback control, no message editing, no proper formatting
- **❌ Not a chat interface:** Terminal is for command output, not conversation
- **❌ Cannot display markdown properly:** Limited ANSI color support

**Recommendation:** ❌ Not viable — completely wrong UX for chat assistant

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

## Decision

**Adopt Option 1: WebviewView (Sidebar)**

**Rationale:**
1. **Meets air-gapped requirement:** No GitHub auth dependency
2. **Best UX:** Persistent sidebar is correct pattern for chat assistant
3. **Proven approach:** Many VS Code extensions use WebviewView for custom UIs
4. **Preserves backend:** No changes to SDK integration, BYOK, or streaming logic
5. **Moderate complexity:** Well within team capability for 2-3 day implementation

**Trade-offs accepted:**
- Custom UI implementation effort (vs. free native Chat Participant UI)
- Webview resource overhead (vs. native UI performance)
- Manual theme integration (vs. automatic native theming)

**Why not Chat Participant API:**
- ❌ Requires GitHub Copilot authentication (violates G3)
- ❌ Cannot work in air-gapped environment
- ❌ Blocking issue for MVP

## Next Steps

1. **Blair or Windows**: Implement Phase 1 (Minimal Viable Sidebar)
   - Priority: P0 (blocks all testing and validation)
   - Dependencies: None (can start immediately)
   - Acceptance criteria: User can open sidebar, send prompt, see streamed markdown response

2. **Childs**: Update documentation
   - Update README to reflect sidebar UI instead of Chat Participant
   - No mention of GitHub Copilot authentication required

3. **MacReady**: Create GitHub issue for WebviewView migration
   - Link this decision document
   - Assign to Blair or Windows based on availability

4. **Squad**: Plan testing strategy
   - SC1-SC7 still apply, but using sidebar instead of Chat Participant panel

## References

- [VS Code Webview API Docs](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code WebviewView Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample)
- [Webview UI Toolkit (deprecated but functional)](https://github.com/microsoft/vscode-webview-ui-toolkit)
- [Research: Chat Participant API requires GitHub Copilot authentication](https://code.visualstudio.com/api/extension-guides/ai/chat)

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

## Implementation Plan

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

### Proposed New Issue Body

---

## Summary

Add the ability to attach **editor selection** and **file references** as context to chat prompts. Since we use a WebviewView (not Chat Participant API), there is no built-in `@workspace` variable — we must build context capture and attachment from scratch using the VS Code Extension API.

## Background

The original issue assumed Chat Participant API, which provides built-in `@workspace` and `#selection` variables. Our architecture uses a custom WebviewView sidebar (`forge.chatView`), so:
- There is no `@workspace` variable — we need to capture and inject context ourselves.
- Editor selection must be read via `vscode.window.activeTextEditor.selection` and forwarded to the webview.
- File content must be resolved and prepended to prompts sent to `CopilotSession`.

## Architecture

### Context flow
```
1. User selects code in editor (or clicks "Attach Selection" button)
2. Extension reads activeTextEditor.selection via VS Code API
3. Context metadata sent to webview via postMessage
4. Webview displays context chip(s) in input area
5. On send, context is included in the message to extension
6. Extension prepends context to the prompt string sent to session.send()
```

## Implementation Plan

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

## Files to Modify

| File | Changes |
|------|---------|
| `src/extension.ts` | Register `forge.attachSelection` and `forge.attachFile` commands; wire `attachSelection`/`attachFile` message handlers; prepend context to prompts in `_handleChatMessage` |
| `media/chat.js` | Add attach buttons, context chip rendering, include context in `sendMessage` payload |
| `media/chat.css` | Styles for attach buttons and context chips |
| `package.json` | Register `forge.attachSelection` and `forge.attachFile` commands; add view/title menu entry; optionally add `autoAttachSelection` setting |
| `src/configuration.ts` | Read `autoAttachSelection` setting (if implemented) |

## Acceptance Criteria

- [ ] User can click "Attach Selection" to capture the current editor selection and see it as a chip in the chat input area.
- [ ] User can click "Attach File" to pick a workspace file and attach it as context.
- [ ] Attached context is visible in the webview as removable chips showing file name and line range.
- [ ] Context is prepended to the prompt sent to `CopilotSession.send()`.
- [ ] Multiple context items can be attached to a single message.
- [ ] Context chips are cleared after sending the message.
- [ ] Context is truncated with a note if it exceeds the size threshold.
- [ ] No regression in existing chat flow (messages without context still work).
- [ ] "Attach Selection" button in the sidebar title bar works when an editor is active.
- [ ] Unit tests cover context capture, prompt construction, and truncation.

## Out of Scope (Phase 3+)

- Full workspace indexing / semantic search (RAG)
- Automatic context from open tabs
- `@workspace` search across all project files
- Drag-and-drop file attachment

## Routing Recommendation

- **Primary: Blair** (`squad:blair`) — VS Code Extension API: editor selection capture, command registration, webview UI, message handling.
- **Secondary: Childs** (`squad:childs`) — Prompt construction: context prepending, size management, ensuring context flows correctly to `CopilotSession`.
- **Review: MacReady** — Architecture review of the context flow and UX design.

---

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
