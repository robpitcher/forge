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

📌 CopilotClient lifecycle validation (2026-02-27): Issue #4 validation confirms the SDK integration is complete and correct. `getOrCreateClient()` implements singleton pattern for lazy init, respects `cliPath` config option, and handles errors gracefully with `CopilotCliNotFoundError`. The `client.stop()` call in `deactivate()` ensures graceful shutdown. SDK manages stdio transport to CLI internally — no additional stdio wiring needed in our code. PR #34 opened as validation task (no code changes required).

📌 import.meta.resolve CJS bundling fix (2026-02-27): `@github/copilot-sdk` v0.1.26 uses `import.meta.resolve("@github/copilot/sdk")` in `getBundledCliPath()` to locate the CLI binary. esbuild's ESM→CJS conversion replaces `import.meta` with an empty object, breaking this call. Fix: esbuild `define` maps `import.meta.resolve` to a banner-injected polyfill (`__importMetaResolve`) that walks `node_modules` directories to resolve specifiers, bypassing Node.js exports-map restrictions that block `require.resolve()` for ESM-only packages. Both `@github/copilot-sdk` and `@github/copilot` only export via `import` condition — `require.resolve()` cannot resolve them. The polyfill returns `file://` URLs matching native `import.meta.resolve` behavior.
