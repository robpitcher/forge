# MacReady: PRD Decomposition

**Timestamp:** 2026-02-27T04:19:00Z  
**Agent:** MacReady  
**Mode:** sync  
**Model:** claude-haiku-4.5

## Task

Decompose the Enclave MVP PRD into GitHub work items with dependencies, priorities, milestones, and squad routing.

## Outcome

✅ **Success**

- **28 work items** created across 5 tracks:
  - **Track 1: Foundational** (Issue 1) — Scaffolding validation
  - **Track 2: Core** (Issues 2–8) — Chat participant, client, BYOK, settings, streaming, error handling, cancellation
  - **Track 3: Testing** (Issues 9–13) — E2E and feature validation (SC1–SC7)
  - **Track 4: Packaging** (Issues 14–16) — Build, VSIX, sideload
  - **Track 5: Documentation & Polish** (Issues 17–23) — README, config guide, type safety, linting
  - **Post-MVP Roadmap** (Issues 24–28) — Phase 2–6 reference items

- **Dependency graph** established: scaffolding → core → test → package → docs

- **Squad routing** assigned:
  - Windows: Build pipeline, testing infrastructure
  - Blair: Core implementation, feature validation, linting
  - Childs: Settings, documentation, post-MVP features

- **Decision merged** to `.squad/decisions/inbox/macready-prd-decomposition.md`

## Key Decisions

1. **28 items, not 50+**: Right-sized for one squad member, one session each. Avoids micro- and macro-granularity.
2. **No automated tests for MVP**: Manual E2E testing (SC1–SC7) is the validation path per PRD. Consistent with PoC nature.
3. **Critical path is P0-blocking**: Issues 1–5, 6–8, 9–12, 14–16 form the minimum viable delivery.
4. **P2 & post-MVP are explicitly deferred**: Managed Identity, tools, multi-model, CLI bundling, slash commands — all listed with reason and phase.
5. **Risks documented**: Conversation ID derivation, type safety with Preview SDK, session cleanup, API key storage.

## Next Steps

- Childs creates GitHub issues (#2–#29) and project board
- Windows starts Issue 1 validation
- Squad begins daily standups to track blockers
