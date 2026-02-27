# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Key Files

- `src/copilotService.ts` — CopilotClient lifecycle, BYOK session creation, session map
- `src/extension.ts` — Where SDK events (message_delta, session.idle, session.error) are consumed
- `package.json` — @github/copilot-sdk dependency (v0.1.26)
- `specs/PRD-airgapped-copilot-vscode-extension.md` — Product requirements

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-27T05:03:36Z): MVP triage complete. Documentation issues #17–19 routed to @copilot for initial draft (docs/setup guide); Childs owns #21, #23–24 (deferred features, air-gap guide, config details). Dependency: #19 must complete before #17 final review. — decided by MacReady

📌 Dependency mapping (2026-02-27): Added `**Dependencies:** #X, #Y` sections to all 22 issues with upstream deps. Format: prepend to body with `---` separator. Used `gh issue edit --body` for each. Issues #2, #25–#29 have no MVP dependencies and were left clean.

📌 Sprint field assignment (2026-02-27): Set Sprint iteration field on all 28 project items via GraphQL `updateProjectV2ItemFieldValue` mutation. Project ID: `PVT_kwHOANBAvc4BQSxx`, Sprint Field ID: `PVTIF_lAHOANBAvc4BQSxxzg-dMUk`. Sprint IDs: Sprint 1 = `09d998ce`, Sprint 2 = `3ac56f5d`, Sprint 3 = `59011026`. GitHub Projects V2 API does not support creating new iterations programmatically — must use the web UI for that. Issues #28/#29 parked in Sprint 3 as fallback until Sprint 4/5 are created manually.

📌 Release branch process (2026-02-27): Branching strategy for releases: create `rel/X.Y.Z` from `dev`, strip `.squad/` via `git rm -r --cached .squad/` + `.gitignore` update, push and open PR to `main`. `.squad/` removal is release-branch-only — dev keeps it tracked. PR #30 opened for v0.2.0 (base: main, head: rel/0.2.0). Rob reviews and squash-merges manually. `.github/agents/` is kept on release branches — needed for GitHub agent recognition. Always `git checkout dev` after pushing release branch.
