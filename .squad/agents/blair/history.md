# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27


## Core Context

**Prior work:** Completed issues #100, #101, #102, #103, #104, #105, #106, #108, #109, #110, #111, #112, #12, #120, #125, #13, #2, #23, #25, #26
**Team coordination:** 17 decision meetings

---

## Recent History (Latest Entries)

📌 CLI Preflight Validation (2025-03-03T17:15:00Z) — Added preflight validation that checks if the GitHub Copilot CLI is correctly installed during extension activation. Implemented `performCliPreflight()` in extension.ts that calls `discoverAndValidateCli()` from copilotService. Shows VS Code warning notifications with actionable buttons ("Open Settings", "Open Terminal") based on failure reason (not_found, wrong_binary, version_check_failed). Also posts `cliStatus` message to webview to display an in-chat banner using the same pattern as auth banners. Validation runs fire-and-forget during activation and re-runs when `forge.copilot.cliPath` config changes. Added webview handler `updateCliBanner()` that shows ✅ "CLI ready" (auto-dismisses in 2s) or ⚠️ error message with "Fix" button. Updated test files to mock `discoverAndValidateCli()` and filter `cliStatus` messages. All 246 tests pass, typecheck passes. Pre-existing highlight.js bundling issue on branch is unrelated to this work.
- Preflight validation should NOT block activation — use async fire-and-forget pattern with `.catch()` logging
- VS Code warning messages + webview banners together provide belt-and-suspenders UX
- Reuse existing webview patterns (banner ID, CSS classes, button event handling) for consistency
- Mock new service functions in ALL test files that call activate() to prevent preflight from posting unexpected messages
- Add new message types to test filter lists alongside existing types (authStatus, modelsUpdated, modelSelected, configStatus)
- When build errors appear unrelated to your changes, verify with git diff and git log to confirm pre-existing issues

📌 PR Review Fixes — credentialProvider.ts and extension.ts (2025) — Addressed 5 PR review comments:
1. **Multi-subscription guardrail**: `autoSelectSubscription()` now only auto-selects when exactly ONE enabled subscription exists. Zero or multiple subscriptions return false, and the caller surfaces "Multiple Azure subscriptions found. Run `az account set --subscription <id>` to select one."
2. **Timeout on az commands**: Both `execFileSync` calls in `autoSelectSubscription()` now have `timeout: 10000` (10s) to prevent blocking the extension host.
3. **execFileSync for injection safety**: Replaced `execSync` shell-string construction with `execFileSync("az", [...args])` to prevent command injection via subscription IDs. Updated import from `child_process`.
4. **Double "v" in CLI log**: Removed extra `v` prefix from CLI version log line — `result.version` already includes the full version string.
5. **CLI status caching**: Added `_lastCliValidation` field to `ChatViewProvider`. `postCliStatus()` caches the result. `webviewReady` handler re-sends cached CLI status alongside config status, preventing dropped `cliStatus` messages when preflight completes before webview is ready.
- Updated test mocks from `execSync` → `execFileSync` with proper arg-based matching. All 246 tests pass.

📌 CLI Auto-Install Integration (2025-03-03T20:00:00Z) — Wired CLI auto-install flow into extension activation to catch `CopilotCliNeedsInstallError` and offer automatic installation via `installCopilotCli()`. Changes in `extension.ts`:
1. **Import additions**: Added `CopilotCliNeedsInstallError` to copilotService imports, added `installCopilotCli` and `CliInstallResult` from cliInstaller.ts
2. **ChatViewProvider constructor**: Added `_globalStoragePath: string` parameter (from `context.globalStorageUri.fsPath`) to enable managed CLI installation path
3. **Error handling in `_handleChatMessage`**: Added catch block for `CopilotCliNeedsInstallError` before the existing `CopilotCliNotFoundError` catch — calls `_handleCliAutoInstall()` to show ask-first dialog
4. **New method `_handleCliAutoInstall()`**: Shows info message "Forge needs the GitHub Copilot CLI to work. Install it now?" with Install/Cancel buttons. On Install: shows progress notification, calls `installCopilotCli({ globalStoragePath })`, on success shows "Copilot CLI installed successfully" message, on failure shows error with "Open Settings" button. On Cancel: shows manual install instructions with "Open Settings" option.
5. **Updated function signatures**: Pass `_globalStoragePath` to `getOrCreateSession()`, `resumeConversation()`, `listConversations()`, and `performCliPreflight()` — Childs added these parameters to copilotService functions
6. **Test fixes**: Updated `conversation-history.test.ts` to pass `undefined` for globalStoragePath in `resumeConversation()` call (new optional parameter)
- Key learnings: (1) Auto-install is ask-first, not automatic — user must approve to prevent surprise installs. (2) Progress notifications use `vscode.window.withProgress` with `ProgressLocation.Notification` for non-blocking feedback. (3) globalStoragePath must flow through from `activate()` context all the way to copilotService functions — store in provider instance. (4) Error handling order matters: catch `CopilotCliNeedsInstallError` (no CLI at all) before `CopilotCliNotFoundError` (CLI configured but invalid). (5) Signature changes in copilotService.ts (globalStoragePath as optional param) require test updates across multiple files. (6) Install flow does NOT retry the user's message automatically — instructs user to "try sending a message again" to avoid double-send.

## Learnings

📌 Progress Indicator + Stop Button (#122) — Replaced binary `_isProcessing` flag with 3-phase state machine (`"idle" | "thinking" | "generating"`) in `ChatViewProvider`. Added `_postProcessingPhase()` helper that sets the phase and posts `processingPhaseUpdate` message to webview in one call. Tracks `_currentSession` reference so the `stopRequest` handler can call `session.abort()`. Webview displays animated pulsing-dot indicator ("Forge is thinking..." / "Generating response...") and a red stop button visible only during active requests. Stop button calls `session.abort()` for cancellation, and the existing `session.idle` / `session.error` event handlers clean up naturally.
- New message types added to test filter lists: `processingPhaseUpdate` must be excluded alongside `authStatus`, `modelsUpdated`, `modelSelected`, `configStatus`, `cliStatus`, `workspaceInfo` in tests that check streaming message order
- Helper method `_postProcessingPhase()` consolidates state + postMessage — prevents drift between extension state and webview state
- Stop button uses VS Code error-themed variables (`--vscode-inputValidation-errorBackground`, `--vscode-errorForeground`) for visual distinction
- Progress indicator placed between `#chatMessages` and `.input-area` in HTML template, not inside chatMessages, so it persists across message clears
- `_currentSession` is set just before `_streamResponse()` and cleared in `finally` — ensures stop handler never references a stale session
