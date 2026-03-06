# Decisions

> Team decisions that all agents must respect. Append-only — never edit past entries.

<!-- New decisions are merged here by Scribe from .squad/decisions/inbox/ -->


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
# Decision: CLI UX Improvements — Install Links and Persistent Banners

**Author:** Blair (Extension Dev)
**Date:** 2025-07-24

## Context

Users hitting Entra ID auth failures because Azure CLI isn't installed had no way to install it from the error UI. Similarly, once the CLI-missing notification balloon was dismissed, there was no persistent way to trigger CLI installation.

## Decisions

1. **`AuthStatus` type extended** with optional `installUrl` field on `notAuthenticated` and `error` states. This is a backwards-compatible union extension.

2. **Generic `openUrl` command** added to the webview→extension message protocol. Validates `https://` prefix before opening. Reusable for future external links.

3. **`installCli` command** added to webview→extension protocol. Calls existing `_handleCliAutoInstall()` flow (ask-first dialog).

4. **CLI banner uses warning style** (amber) instead of error (red) when CLI is not found and config is complete. This is less alarming and more actionable.

5. **Config gating** — CLI missing banner is hidden during initial setup (before endpoint/auth/models are configured) to avoid overwhelming new users.

## Impact

- `AuthStatus` type in `src/auth/authStatusProvider.ts` — consumers should handle the new optional field
- New webview commands: `openUrl`, `installCli`
- New CSS class: `.auth-banner.warning`

# Decision: Marketplace Pre-Release Publishing for Insider Builds

**Date:** 2026-03-03  
**Decider:** Palmer (DevOps Specialist)  
**Context:** Rob Pitcher requested marketplace publishing for insider builds using publisher `robpitcher` and PAT stored as `ADO_MARKETPLACE_PAT`.

## Decision

Extend `.github/workflows/insider-release.yml` to publish pre-release builds to the VS Code Marketplace after creating the GitHub Release.

### Dual-Version Strategy

1. **GitHub Release tags:** Continue using `{version}-insider+{short-sha}` format (e.g., `0.2.0-insider+abc1234`) for GitHub tags and releases.
2. **Marketplace versions:** Use `{major}.{minor}.{github.run_number}` (e.g., `0.2.15`) for marketplace publishing.

**Rationale:** 
- GitHub releases need semantic, human-readable versions with commit context for traceability.
- VS Code Marketplace requires unique numeric versions for each publish — run_number provides this.
- These are separate concerns with different requirements, so separate versioning is appropriate.

### Implementation

**package.json changes:**
- Added `"vscode:prepublish": "npm run build -- --production"` — VS Code extension convention, auto-runs before vsce operations.
- Changed `package` script from `"npm run build -- --production && vsce package"` to `"vsce package"` — build delegated to lifecycle hook.

**insider-release.yml workflow:**
- Added marketplace publishing steps AFTER GitHub Release verification.
- Version computation: `npm version {major}.{minor}.{run_number} --no-git-tag-version` — updates package.json in CI only, not committed.
- Package and publish with `npx @vscode/vsce package --pre-release` and `npx @vscode/vsce publish --pre-release --pat`.
- Error handling: `continue-on-error: true` — if marketplace publish fails, GitHub Release still succeeds.

### Trade-offs

**Pros:**
- Insider builds available on marketplace with "Pre-Release" badge.
- Automatic publishing reduces manual release overhead.
- Unique marketplace versions prevent conflicts.

**Cons:**
- Marketplace version (`0.2.15`) diverges from GitHub tag (`0.2.0-insider+abc1234`) — could confuse users looking at both sources.
- Marketplace publish failures are silently ignored (workflow succeeds even if marketplace step fails).

**Mitigation:**
- The GitHub Release is the authoritative artifact — marketplace is convenience distribution.
- Run logs will show marketplace publish failures even if workflow succeeds overall.

## Impact

- Users can install insider builds directly from VS Code Marketplace without manual .vsix downloads.
- `vscode:prepublish` hook ensures production builds run automatically before packaging.
- Marketplace pre-release channel is now active for early adopters.

## References

- Issue/PR: [context from Rob's request]
- Files changed: `package.json`, `.github/workflows/insider-release.yml`
- PAT secret: `ADO_MARKETPLACE_PAT` (stored in repo secrets)

---

### 2026-03-05: Progress Indicator + Stop Button Architecture & Implementation

**Date:** 2026-03-05  
**Authors:** MacReady (Architect), Blair (Implementation), Windows (Testing)  
**Issue:** #122 (Stop Button Robustness)  
**Status:** Complete

#### Summary

Implemented a 4-state processing phase state machine (`idle` → `thinking` → `generating` → `idle`) with animated progress indicator and stop button cancellation across the extension, webview, and tests.

#### Architecture Decisions

1. **State Machine:** Replaced binary `isProcessing` with 3-phase state machine. Extension posts `processingPhaseUpdate` messages to webview at key points (before credential validation, before `session.send()`, in finally block).

2. **Progress Indicator Placement:** Between `#chatMessages` and `.input-area` in HTML — persists across conversation resets (which clear chatMessages.innerHTML).

3. **UI Components:**
   - Progress indicator: Animated pulsing dots with dynamic text ("Forge is thinking..." / "Generating response...")
   - Stop button: Separate from send button, hidden when idle, optimistically disabled on click
   - Message type: `processingPhaseUpdate` (extension → webview) with phase value, `stopRequest` (webview → extension) for cancellation

4. **Cancellation Flow:** User clicks stop → webview posts `stopRequest` → extension calls `session.abort()` → partial response preserved → phase reset to idle → tokens stop arriving

5. **Test Strategy:** Full sequence verification (ordering bugs caught) using never-resolving `session.send()` mock pattern for mid-stream interaction testing.

#### Implementation Details

**Files Modified:**
- `src/extension.ts`: Phase state machine, `stopRequest` handler with `session.abort()`, session reference storage (`_currentSession`), HTML template (progress indicator div + stop button)
- `media/chat.js`: Phase tracking, stop button handler, `processingPhaseUpdate` message handler, indicator/button visibility functions
- `media/chat.css`: `.progress-indicator` and `.progress-dots` animation, `.hidden` utility class, stop button styles

**New Test Coverage:**
- Phase transitions (`idle` → `thinking` → `generating` → `idle`) with message verification
- Stop request handling with mid-stream injection
- State machine ordering (catches bugs that individual assertions would miss)
- All 301 tests pass

#### Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `session.abort()` behavior undefined in SDK v0.1.26 | Medium | Wrapped in try-catch; graceful degradation if unavailable |
| Phase tracking wrong mid-request | Low | Set at specific deterministic points; try-catch for exceptions |
| Stop button spam | Low | Disabled on first click (optimistic UI); SDK should be idempotent |
| Progress indicator blocks UX | Low | Inline, non-blocking, hidden when idle |

#### Success Criteria Met

- ✅ Progress feedback visible during all inference phases
- ✅ Stop button visible and clickable during active requests
- ✅ Clicking stop cancels in-flight request via `session.abort()`
- ✅ Partial responses preserved when generation is stopped
- ✅ Zero regressions (all existing tests pass)

---

### 2026-03-05: Workspace Awareness via workingDirectory

**Author:** MacReady (Architecture & Design)  
**Date:** 2026-03-05  
**Status:** Implemented by Blair, tested by Windows  

## Problem

When a user chats with Forge, the AI has no awareness of which workspace folder is open in VS Code. Tool operations (shell, read, write) run in whatever directory the CLI process happens to use — not the user's project folder. The AI can't give workspace-relative answers ("what files are in my project?", "fix the bug in src/app.ts").

## Discovery

The `@github/copilot-sdk` has a `workingDirectory` field on `SessionConfig` (and `ResumeSessionConfig`) with the comment "Tool operations will be relative to this directory." The `buildSessionConfig()` function in `copilotService.ts` constructs the session config but was not setting `workingDirectory`.

## Decision

- Capture the primary workspace folder at session creation time: `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`
- Pass `workspaceRoot` as `workingDirectory` in session config (in `buildSessionConfig`, `getOrCreateSession`, `resumeConversation`)
- Include `workspaceRoot` in the `configHash` so sessions are recreated when the workspace changes
- Show a passive `📂 folder-name` indicator in the webview context-actions bar
- Send `workspaceInfo` message to webview on initial load and on `onDidChangeWorkspaceFolders`
- Multi-root workspaces use first folder only, matching Copilot's behavior

## Rationale

- Uses SDK's native mechanism — avoids prompt injection, uses the platform's intended design
- No new settings needed — fully automatic based on the open workspace
- Indicator is passive (not interactive) — just shows user what folder the SDK is aware of
- Session isolation via configHash prevents cache collisions across workspaces

## Files Modified

| File | Change |
|------|--------|
| `src/copilotService.ts` | Add `workspaceRoot?` param to `buildSessionConfig`, `getOrCreateSession`, `resumeConversation`; add to `configHash`; pass as `workingDirectory` in session config |
| `src/extension.ts` | Add `_workspaceRoot` getter; add `onDidChangeWorkspaceFolders` listener; add `postWorkspaceInfo()` method; update HTML template |
| `media/chat.js` | Handle `workspaceInfo` message; show/hide indicator |
| `media/chat.css` | Style `.workspace-indicator` |

## Impact

- Tool operations execute in the user's project folder context
- Multi-turn conversations maintain workspace awareness
- Workspace changes transparently create new session with updated context
- Feature matches behavior of GitHub Copilot

---

### 2026-03-05: Test Filter Pattern for Workspace Awareness Messages

**Author:** Windows (QA & Testing)  
**Date:** 2026-03-05  
**Scope:** Test assertions that filter streaming order messages

## Context

Workspace awareness feature adds `_postWorkspaceInfo()` method that fires during `resolveWebviewView()`. This message arrives as an infrastructure message before any chat interaction.

## Decision

Any test that filters posted webview messages to assert on streaming protocol order (streamStart → streamDelta → streamEnd) must exclude `workspaceInfo` from the filter, alongside existing infrastructure message types: `authStatus`, `modelsUpdated`, `modelSelected`, `configStatus`, `cliStatus`.

## Rationale

Tests that count or order non-infrastructure messages will break if they don't exclude `workspaceInfo`. The message is infrastructure (system state), not domain (chat protocol), so it must be filtered out.

## Pattern

```typescript
const types = getPostedMessages(mockView)
  .filter((m: unknown) => {
    const t = (m as { type: string }).type;
    return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus" && t !== "cliStatus" && t !== "workspaceInfo";
  })
  .map((m: unknown) => (m as { type: string }).type);
```

Apply this filter to all streaming order assertions and count-based checks in:
- `copilotService.test.ts`
- `extension.test.ts`
- `tool-approval.test.ts`

## Impact

- Ensures test stability across workspace awareness feature
- Future tests must follow this pattern when asserting on streaming order
- Removes false test failures from infrastructure noise

# Decision: README Documentation Improvements — Features, Architecture & Installation Paths

**Date:** 2026-03-15
**Author:** Fuchs (Technical Writer)
**Scope:** `README.md`
**Status:** Merged
**Commits:** 
  - fc5e30b (Features & diagram)
  - 0914c65 (Installation reordering)

## Problem

Three README issues identified:

1. **Features buried:** Features section was positioned after Prerequisites, making it less discoverable. New developers don't immediately see that Forge supports flexible authentication (Entra ID & API Key) — key differentiators for air-gapped environments.

2. **Architecture diagram misleading:** Labeled as "Azure AI Foundry (Private Endpoint)" with connection "HTTPS (private network)", overstating scope and suggesting a complete private connectivity implementation not actually depicted.

3. **Installation pathway unclear:** README's Quick Start and Installation sections positioned GitHub Releases sideloading as the primary/recommended path, misaligned with standard VS Code extension distribution (Marketplace is the user expectation).

## Decision

### 1. Move Features Before Prerequisites

**New section order:**
1. Heading/description
2. **Features** ← moved up
3. Prerequisites
4. Quick Start
5. Usage
6. Architecture
7. Installation
8. Configuration
9. Development
10. License

**Rationale:**
- Visitors see authentication options and code actions immediately
- Better narrative flow: "Here's what Forge offers → here's what you need → let's get started"

### 2. Simplify Architecture Diagram

**Changes:**
- Remove "(Private Endpoint)" from Azure AI Foundry node label
- Change CLI→Azure connection label from "HTTPS (private network)" to just "HTTPS"

**Rationale:**
- Diagram accurately represents a **minimal viable deployment** without implying full private networking
- Prevents misunderstanding that the architecture alone provides air-gap compliance
- Enterprise architecture doc (docs/enterprise-architecture.md) covers private connectivity patterns

### 3. Marketplace-First Installation Path

**Changes made:**

- **Quick Start (line 41):** Primary instruction is to search for "Forge" in VS Code Extensions panel or use Marketplace link. Fallback note: "If your environment doesn't have Marketplace access, see Installation for the sideload option"

- **Installation (lines 96–110):**
  - Reordered: Marketplace subsection first, GitHub Releases second
  - Marketplace header: "(recommended)" — signals it's the primary path
  - Releases header: "(for restricted or air-gapped networks)" — signals it's an alternative with a use case

**Rationale:**
- User expectations: 99% of VS Code users expect Marketplace as the primary installation method
- Air-gapped support: Sideload remains fully documented and prominent — just reframed as "when you need it"
- Tone: Marketplace = easy/default; sideload = valid/alternative. Reflects Forge's dual nature
- Accuracy: Marketplace publishes pre-release builds, so it's current and actively maintained

## Impact

✅ Improves onboarding for mainstream VS Code users  
✅ Maintains full support for air-gapped/restricted deployments  
✅ Architecture diagram honest about scope; prevents misunderstanding  
✅ Marketplace pathway prominent; GitHub Release sideload still available  
✅ Features section visible to new visitors  
✅ All existing workflows still work (no breaking changes)

---

# Decision: Stable release must publish the built .vsix, not re-build

**Date:** 2026-03-05
**Author:** Palmer (DevOps)
**Scope:** `.github/workflows/release.yml`

## Decision

The stable release workflow's marketplace publish step must use `--packagePath` to publish the exact `.vsix` artifact that was already built, tested, and attached to the GitHub Release. It must NOT call bare `vsce publish` which re-builds from source.

## Rationale

- **Build once, publish everywhere:** Re-building from source means the GitHub Release `.vsix` and the marketplace `.vsix` could differ (non-deterministic builds, different timestamps, potential dependency drift).
- **Consistency with insider:** The insider workflow also packages once and uploads to both GitHub Release and marketplace (though it re-packages for marketplace due to version rewriting — stable releases don't need this since package.json version IS the marketplace version).

## Convention

For stable releases: `vsce publish --packagePath {artifact}.vsix`
For insider releases: re-package is acceptable because marketplace version differs from tag version.

---

### 2026-03-05T17:47:08Z: Slidev Skill File Created

**Author:** Fuchs (Technical Writer)  
**Date:** 2026-03-05  
**Status:** Informational  

**Context:** Rob requested a team skill file for Slidev (sli.dev) so anyone building presentations knows the patterns.

**Decision:** Created `.squad/skills/slidev/SKILL.md` with comprehensive patterns extracted from sli.dev official documentation.

**Key Points:**
1. **Isolation rule:** Slidev projects live in `slides/` with their own `package.json` — completely separate from the VS Code extension root.
2. **Confidence: low** — the team hasn't used Slidev yet, so patterns may evolve with real usage.
3. **No slides/ directory created** — the skill documents *how* to set up Slidev when needed, but doesn't scaffold anything yet.

**Impact:** Any team member building a presentation can reference this skill for setup, syntax, and export patterns. The isolation rule prevents accidental dependency pollution of the main extension.
# Decision: Slidev Presentation Deck Structure

**Date:** 2026-03-06  
**Author:** Fuchs (Technical Writer)  
**Status:** Implemented

## Context

Rob requested a demo/showcase Slidev deck for the Forge project, to be deployed to GitHub Pages.

## Decision

1. **Isolation:** Slidev lives in `slides/` with its own `package.json` — zero impact on the VS Code extension root. `slides/node_modules` and `slides/dist` added to root `.gitignore`.

2. **GitHub Pages base path:** Build script uses `--base /forge/` to match the expected GitHub Pages URL (`https://robpitcher.github.io/forge/`). Change this if the repo name differs.

3. **Static assets:** Cover image (`repoheader.png`) copied into `slides/public/` for proper Slidev static asset resolution. Referenced as `/repoheader.png` in slides (Slidev serves `public/` at root).

4. **Theme:** `seriph` (clean, professional, widely used). Pinned via `@slidev/theme-seriph` in `slides/package.json` devDependencies.

5. **Content structure (9 slides):** Cover → Problem → What is Forge → Architecture (Mermaid) → Key Features → Getting Started → Enterprise Architecture (Mermaid) → Built With → End/Links.

## Implications

- CI/CD for GitHub Pages deployment is a separate concern (Palmer/DevOps).
- Future slide updates should stay in `slides/slides.md` — no imports from `src/`.
- To preview locally: `cd slides && npm run dev`.

---

# Decisions (Continued)

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

**Dependencies:** Relies on `discoverAndValidateCli()` and `CopilotCliValidationResult` type added by Childs in parallel.

---

**To Merge:**  
The decision will be merged into `.squad/decisions.md` by the Scribe during standard decision processing. No action required.

---

### 2026-03-05T17:47:08Z: Slidev Isolation Directive

**By:** Rob Pitcher (via Copilot)  
**What:** Keep any references to Slidev (sli.dev) out of the main README and documentation. Slidev content lives in its own isolated `slides/` directory only.  
**Why:** User request — captured for team memory

---

# Decision: Slidev GitHub Pages Deployment

**Date:** 2026-03-06  
**Author:** Palmer (DevOps Specialist)  
**Status:** Implemented

## Context

The team has a Slidev presentation deck in `slides/` that needs to be deployed to GitHub Pages for easy sharing.

## Decision

Created `.github/workflows/slides.yml` with a two-job pipeline (build → deploy) that:

1. **Triggers** on push to `dev` when `slides/**` changes, plus manual `workflow_dispatch`.
2. **Builds** in the `slides/` subdirectory with its own `package.json` and `npm ci` — completely isolated from the root VS Code extension.
3. **Uses `--base /forge/`** because the site deploys to `https://robpitcher.github.io/forge/` (project pages, not user pages).
4. **Uses Node 20** — this is the Slidev deck requirement, independent of the extension CI which uses Node 22.
5. **Uses the standard GitHub Pages pattern:** `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`.

## Constraints

- The `slides/` project is fully self-contained. The workflow does NOT build the VS Code extension.
- Concurrency group `pages` ensures only one deployment runs at a time.
- Permissions scoped to `pages: write` and `id-token: write` (minimum required for Pages deployment).

## Impact

All agents: do NOT modify this workflow unless changing the slides deployment strategy. The `slides/` directory is isolated — changes there should not affect the extension CI pipeline.

---

# Decision: CONTRIBUTING.md Rewrite

**Date:** 2026-03-16  
**Author:** Fuchs (Technical Writer)  
**Status:** Implemented  

## Context

The existing `CONTRIBUTING.md` contained only a bare list of npm commands. Contributors had no guidance on:
- Forking, cloning, or setting up the dev environment
- Branch strategy (when to use `dev` vs `main`)
- PR submission workflow
- Code style expectations
- How to run a complete quality check before committing

## Decision

Rewrote `CONTRIBUTING.md` as a comprehensive 10-section guide:

1. **Welcome** — Brief intro, MIT license note
2. **Getting Started** — Fork/clone + dev container (recommended) + manual setup
3. **Development Workflow** — Build commands table + full quality check command + F5 testing in VS Code
4. **Branch Strategy** — `dev` as default, `main` as release-only; squad branch naming
5. **Making Changes** — Step-by-step workflow from branch creation to PR
6. **Pull Request Guidelines** — Checklist, description template, review expectations
7. **Code Style** — TypeScript conventions (strict mode, import type, .js paths), linting, testing
8. **Reporting Issues** — Bug reports, features, security process
9. **Documentation** — Where docs live, what to edit
10. **License** — MIT contributions clarification

## Key Structural Choices

### Dev Containers as Recommended Path
Positioned `.devcontainer/devcontainer.json` as the **recommended** onboarding path (Codespaces or VS Code Dev Containers), with manual Node 22 + npm setup as a fallback. This reduces friction for new contributors while respecting developers who prefer local setup.

### Full Quality Check Command
Made the **pre-commit check explicit:**
```bash
npm run build && npx tsc --noEmit && npm test
```
This combines build, type checking, and tests into one memorable command. It now appears in three places: Development Workflow table, Making Changes workflow, and as a bolded reminder in Pull Request Guidelines.

### Unchanged npm Commands
All existing npm commands remain **exactly as they are** in the original CONTRIBUTING.md. No renaming, no new commands. Simplifies transition for existing contributors.

### Squad Branch Naming Included
Documented squad branch convention `squad/{issue}-{slug}` alongside descriptive feature names. This acknowledges the squad workflow without excluding contributors not using squad labels.

### Architecture Pointer, Not Duplication
The Architecture Overview section **orients contributors to key files** without duplicating the full system design (which lives in README.md and docs/). This reduces maintenance burden — if architecture changes, contributors read the source of truth, not outdated CONTRIBUTING.md.

### Concise, Scannable Tone
- Used tables for build commands, checklists for PR submissions
- Short paragraphs, bullet points, code blocks
- Developer-focused language (no marketing; no overly long motivational text)
- Assumes readers understand Git and TypeScript basics

## Rationale

A comprehensive contributing guide **accelerates onboarding** and **reduces support burden**. New contributors can answer their own questions:
- "How do I set up?" → Getting Started
- "What branch do I use?" → Branch Strategy
- "How do I test my change?" → Full Quality Check
- "What code style?" → Code Style

This guide also **documents implicit team decisions** (e.g., "dev is the default branch, main is for releases") that were previously communicated only in PRs or ad-hoc.

## Impact

- **First-time contributors** have a clear path: fork → branch from dev → full check → PR targeting dev
- **Code quality** improved: explicit "full check" command reduces accidental breakage
- **Review efficiency:** contributors come prepared with passing tests and lints
- **Consistency:** squad members and external contributors now follow the same workflow

---

