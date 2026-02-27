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
