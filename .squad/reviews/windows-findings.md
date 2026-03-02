# Test Coverage Analysis — Windows

## Summary

198 tests across 13 test files: 195 pass, 3 todo, 0 failures. Core service layer (`copilotService.ts`, `configuration.ts`, `credentialProvider.ts`, `authStatusProvider.ts`) has strong coverage. **Critical gap: `codeActionProvider.ts` has zero tests, and `extension.ts` has large untested regions** — particularly `activate()` command wiring, `updateAuthStatus()`, `sendFromEditor()`, `_handleResumeConversation()`, `_handleDeleteConversation()`, `_handleListConversations()`, `_promptAndStoreApiKey()`, `openSettings()`, `postAuthStatus()` deduplication, `_rewriteAuthError()`, model switching (`modelChanged`), and the full `_getHtmlForWebview()` CSP policy.

## Current Test Status

```
 RUN  v4.0.18 /workspaces/forge

 Test Files  13 passed (13)
      Tests  195 passed | 3 todo (198)
   Duration  1.16s (transform 2.24s, setup 0ms, import 2.96s, tests 2.30s)
```

All 195 active tests pass. 3 todo tests in `tool-approval.test.ts` await implementation.

## Coverage Matrix

| Source File | Test File(s) | Coverage Level | Key Gaps |
|-------------|-------------|---------------|----------|
| `src/extension.ts` (905 lines) | `extension.test.ts`, `error-scenarios.test.ts`, `multi-turn.test.ts`, `context-attachment.test.ts`, `tool-approval.test.ts` | **Partial** | No tests for: `activate()` command registration, `updateAuthStatus()`, `sendFromEditor()`, `deactivate()`, `_handleResumeConversation()`, `_handleDeleteConversation()`, `_handleListConversations()`, `openSettings()`, `_promptAndStoreApiKey()`, `_rewriteAuthError()`, `modelChanged` handler, `postAuthStatus()` dedup, auth polling, config change listener, `chatFocused` handler, `_isProcessing` guard, `_getHtmlForWebview()` CSP |
| `src/copilotService.ts` (340 lines) | `copilotService.test.ts`, `multi-turn.test.ts`, `air-gap-validation.test.ts`, `conversation-history.test.ts`, `tool-control-settings.test.ts`, `mcp-server-config.test.ts` | **Good** | `destroySession()` abort error path logged but not asserted; `destroyAllSessions()` partial-failure path not tested; `getSessionCount()` never tested (unused function); `buildProviderConfig()` wireApi fallback to undefined not directly tested |
| `src/configuration.ts` (169 lines) | `configuration.test.ts`, `mcp-server-config.test.ts` | **Good** | `getConfigurationAsync()` SecretStorage error path not tested; MCP remote server validation with invalid headers not tested; `allowRemoteMcp` default `undefined` coercion |
| `src/auth/credentialProvider.ts` (71 lines) | `auth/credentialProvider.test.ts` | **Good** | No test for `createCredentialProvider` when `@azure/identity` import fails (dynamic import rejection) |
| `src/auth/authStatusProvider.ts` (126 lines) | `auth/authStatusProvider.test.ts` | **Good** | `decodeJwtPayload()` not directly tested (private); `isNotLoggedInError()` patterns partially covered via integration; no test for JWT with valid payload claims (upn, preferred_username, name); no test for malformed JWT base64 |
| `src/codeActionProvider.ts` (49 lines) | **NONE** | **None** | No test file exists. Zero coverage for `provideCodeActions()`, empty range guard, action kinds, command wiring |
| `src/types.ts` (200 lines) | N/A (type-only) | **N/A** | Type definitions — no runtime behavior to test |

## Findings

### 🔴 Critical: No tests for `codeActionProvider.ts`
- **Location:** `src/codeActionProvider.ts` (entire file)
- **Category:** Missing Tests
- **Description:** `ForgeCodeActionProvider` has zero test coverage. The `provideCodeActions()` method, its empty-range guard returning `undefined`, the three code actions (Explain, Fix, Write Tests), their command wiring, and `providedCodeActionKinds` are all untested.
- **Impact:** Regressions in code action logic (wrong commands, broken range checks) would ship undetected. This is a user-facing feature registered for all file schemes.
- **Remediation:** Create `src/test/codeActionProvider.test.ts` with tests for:
  1. Returns `undefined` for empty range
  2. Returns 3 code actions for non-empty range
  3. Each action has correct command (`forge.explain`, `forge.fix`, `forge.tests`)
  4. Each action has `CodeActionKind.QuickFix`
  5. `providedCodeActionKinds` is `[QuickFix]`

### 🔴 Critical: No tests for conversation management in extension.ts
- **Location:** `src/extension.ts:770-862` (`_handleListConversations`, `_handleResumeConversation`, `_handleDeleteConversation`)
- **Category:** Missing Tests
- **Description:** Three conversation history handlers in `ChatViewProvider` have zero test coverage through the webview message protocol. These methods handle auth validation, credential provider creation, session destruction, workspaceState cache management, and error posting — all untested paths.
- **Impact:** Conversation resume could silently fail, delete could leave stale cache entries, list errors could crash without user feedback. These are user-facing features for conversation history (#87).
- **Remediation:** Add tests in `extension.test.ts` for:
  1. `listConversations` command posts `conversationList` message
  2. `listConversations` error posts `error` message
  3. `resumeConversation` validates sessionId, destroys current session, posts `conversationResumed`
  4. `resumeConversation` with invalid auth posts appropriate error
  5. `deleteConversation` removes cached messages, refreshes conversation list
  6. `deleteConversation` with missing sessionId posts error

### 🟠 High: No tests for `_rewriteAuthError()`
- **Location:** `src/extension.ts:613-619`
- **Category:** Missing Error Path Tests
- **Description:** `_rewriteAuthError()` intercepts SDK auth errors containing "authorization", "401", "unauthorized", or "/login" and rewrites them to a user-friendly message pointing at the settings gear. This rewriting logic has zero tests.
- **Impact:** If rewrite patterns break or regress, users would see raw SDK error messages instead of actionable instructions — directly violating the error handling standards (Error Handling Standards §2: "Error messages must be actionable").
- **Remediation:** Test that:
  1. Messages containing "401" are rewritten
  2. Messages containing "unauthorized" (case-insensitive) are rewritten
  3. Messages containing "authorization" are rewritten
  4. Messages containing "/login" are rewritten
  5. Normal error messages pass through unchanged
  6. Rewritten message mentions "API key" and "gear icon"

### 🟠 High: No tests for `updateAuthStatus()` status bar behavior
- **Location:** `src/extension.ts:204-242`
- **Category:** Missing Tests
- **Description:** `updateAuthStatus()` maps `AuthStatus` states to status bar text, tooltip, and command — 3 branches (`authenticated`, `notAuthenticated`, `error`) with sub-branches for Entra ID vs API Key. Also calls `provider.postAuthStatus()`. None of this is tested.
- **Impact:** Status bar could show wrong text/icon for auth state, tooltip could be wrong or missing, click command could be wrong — all silently breaking the auth UX.
- **Remediation:** Test each status bar state:
  1. Authenticated Entra ID with account → "$(pass) Forge: Authenticated", tooltip shows account
  2. Authenticated API Key → correct tooltip
  3. Not authenticated Entra ID → "$(sign-in) Forge: Sign In"
  4. Not authenticated API Key → "$(key) Forge: Set API Key"
  5. Error state → "$(warning) Forge: Auth Issue", tooltip truncated at 80 chars

### 🟠 High: No tests for `modelChanged` handler
- **Location:** `src/extension.ts:402-422`
- **Category:** Missing Tests
- **Description:** The `modelChanged` command handler presents a warning dialog, persists model selection to workspaceState, destroys the current session, resets conversation, and posts both `conversationReset` and `modelSelected` messages. None of these behaviors are tested.
- **Impact:** Model switching could silently fail to reset the session, persist the wrong model, or skip the confirmation dialog — leading to confused responses from the wrong model.
- **Remediation:** Test that:
  1. Warning dialog is shown before model change
  2. Cancelling the dialog reverts model selection
  3. Confirming destroys current session and creates new conversation ID
  4. New model is persisted to workspaceState
  5. Both `conversationReset` and `modelSelected` messages are posted

### 🟠 High: `postAuthStatus()` deduplication not tested
- **Location:** `src/extension.ts:298-306`
- **Category:** Missing Tests
- **Description:** `postAuthStatus()` deduplicates authStatus messages using a JSON-stringified key to prevent banner flashing every 30s poll. This dedup logic is untested — calling with the same status twice should only post once.
- **Impact:** If dedup breaks, the webview gets spammed with identical auth status messages every 30 seconds, causing UI flicker and potential state confusion.
- **Remediation:** Test that:
  1. First call posts authStatus to webview
  2. Second call with same status does NOT post (dedup)
  3. Call with changed status DOES post
  4. After `resolveWebviewView` re-creates the view, dedup state resets

### 🟠 High: No tests for `sendFromEditor()` and code action commands
- **Location:** `src/extension.ts:175-201` and `src/extension.ts:159-167`
- **Category:** Missing Tests
- **Description:** `sendFromEditor()` grabs editor selection, constructs a `ContextItem`, reveals the Forge panel, and sends via `sendMessageWithContext`. The `forge.explain`, `forge.fix`, and `forge.tests` commands all delegate to this function. None of this is tested.
- **Impact:** Code actions triggered from the lightbulb menu could silently fail — no editor, empty selection, wrong context format — all undetected.
- **Remediation:** Test that:
  1. `sendFromEditor` returns early with no active editor
  2. `sendFromEditor` returns early with empty selection
  3. `sendFromEditor` constructs correct ContextItem with language, file path, line range
  4. `sendFromEditor` reveals forge.chatView and sends message with context

### 🟡 Medium: `_isProcessing` guard not tested
- **Location:** `src/extension.ts:476`
- **Category:** Missing Edge Case Tests
- **Description:** `_handleChatMessage` returns early if `_isProcessing` is true (re-entrancy guard). This prevents overlapping streams. No test verifies that sending a second message while the first is still streaming is silently dropped.
- **Impact:** Without this guard, two concurrent streams could interleave tokens and corrupt the chat display. Regression would be silent and hard to reproduce.
- **Remediation:** Test that sending a second message during an active stream does NOT trigger a second `streamStart`. Verify the second message is silently dropped.

### 🟡 Medium: `chatFocused` auto-attach handler not tested
- **Location:** `src/extension.ts:423-444`
- **Category:** Missing Tests
- **Description:** The `chatFocused` command handler reads the active editor selection and posts a `contextAttached` message with `autoAttached: true`. Not tested at all.
- **Impact:** Auto-attach could silently break, sending wrong context or crashing on edge cases (no editor, empty selection, multi-line selection boundary).
- **Remediation:** Test through webview message protocol: simulate `chatFocused` command, verify `contextAttached` message with `autoAttached: true`.

### 🟡 Medium: `openSettings()` quick pick flow not tested
- **Location:** `src/extension.ts:345-355`
- **Category:** Missing Tests
- **Description:** `openSettings()` shows a QuickPick with "Open Settings" and "Set API Key (secure)" options. Neither branch is tested — "Open Settings" should call `workbench.action.openSettings`, and "Set API Key" should call `_promptAndStoreApiKey()`.
- **Impact:** Settings flow could route to wrong command or silently fail if QuickPick returns unexpected value.
- **Remediation:** Test both QuickPick paths and the "cancel" (undefined) path.

### 🟡 Medium: `_promptAndStoreApiKey()` not tested
- **Location:** `src/extension.ts:358-369`
- **Category:** Missing Tests
- **Description:** Private method that shows an input box, stores the key in SecretStorage, shows a confirmation message, and triggers auth refresh. No test coverage.
- **Impact:** API key storage flow could silently break — key not stored, confirmation not shown, auth not refreshed.
- **Remediation:** Test through `openSettings()` or `setApiKey` command: verify SecretStorage.store called, info message shown, auth refresh triggered.

### 🟡 Medium: `destroySession()` and `destroyAllSessions()` error paths
- **Location:** `src/copilotService.ts:178-221`
- **Category:** Missing Error Path Tests
- **Description:** `destroySession()` catches abort errors and logs them via `console.warn`. `destroyAllSessions()` has three error paths: undefined session, synchronous throw from `abort()`, and async rejection from `abort()`. None of these error paths are directly tested.
- **Impact:** Session cleanup failures during deactivation or conversation reset could leak resources or produce unexpected behavior without test verification.
- **Remediation:** Test that:
  1. `destroySession()` with session that throws on abort still deletes from map
  2. `destroyAllSessions()` with mixed healthy/broken sessions still clears all
  3. `destroyAllSessions()` with undefined sessions in map doesn't throw

### 🟡 Medium: `getSessionCount()` is dead code
- **Location:** `src/copilotService.ts:223-225`
- **Category:** Dead Code
- **Description:** `getSessionCount()` is defined but never exported or called anywhere in the codebase. It's unreachable dead code.
- **Impact:** Minor — adds noise to the module but no functional risk. However, if someone adds tests for it, they'd be testing dead code.
- **Remediation:** Either export and use it, or delete it.

### 🟡 Medium: `decodeJwtPayload()` and `isNotLoggedInError()` untested directly
- **Location:** `src/auth/authStatusProvider.ts:95-125`
- **Category:** Missing Edge Case Tests
- **Description:** `decodeJwtPayload()` parses JWT tokens and extracts identity claims. `isNotLoggedInError()` matches 8 regex patterns. Both are private but are indirectly tested through `checkAuthStatus()`. However, edge cases are missing: malformed base64, 2-part token, JSON parse failure, JWT with `preferred_username` but no `upn`, JWT with only `name` claim.
- **Impact:** JWT parsing could silently fail on real Azure tokens with unexpected claim structures. The "not logged in" detection could miss new Azure AD error patterns.
- **Remediation:** Test via `checkAuthStatus()` with mock credential providers returning JWTs:
  1. JWT with `upn` claim → account extracted
  2. JWT with `preferred_username` but no `upn` → preferred_username extracted
  3. JWT with only `name` → name extracted
  4. JWT with no identity claims → authenticated with no account
  5. Non-JWT string → authenticated with no account
  6. Malformed base64 → authenticated with no account

### 🟡 Medium: `createCredentialProvider` dynamic import failure not tested
- **Location:** `src/auth/credentialProvider.ts:63`
- **Category:** Missing Error Path Tests
- **Description:** When `authMethod` is `entraId`, the factory does `await import("@azure/identity")`. If this dynamic import fails (package not installed, bundling issue), the error propagates uncaught. No test covers this.
- **Impact:** In an air-gapped deployment without `@azure/identity` installed, selecting Entra ID auth would crash with an opaque module-not-found error.
- **Remediation:** Test that `createCredentialProvider` with entraId throws a clear error when `@azure/identity` import fails.

### 🟡 Medium: `getConfigurationAsync()` SecretStorage error path
- **Location:** `src/configuration.ts:49-56`
- **Category:** Missing Error Path Tests
- **Description:** `getConfigurationAsync()` calls `secrets.get()` which can throw. No test covers what happens when SecretStorage is unavailable or throws.
- **Impact:** If SecretStorage has an intermittent failure, the error propagates to the caller. Extension.ts catches this at line 481 — but the catch path (`"Failed to read API key"`) is also untested end-to-end.
- **Remediation:** Test that `getConfigurationAsync` propagates SecretStorage errors cleanly.

### 🟡 Medium: 3 todo tests in tool-approval.test.ts
- **Location:** `src/test/tool-approval.test.ts:135,357,363`
- **Category:** Missing Tests (acknowledged)
- **Description:** Three `.todo()` tests: (1) "does not pass availableTools:[] when creating a session", (2) "handles toolResponse for unknown/expired tool call ID gracefully", (3) "tracks multiple concurrent tool calls independently". These are explicitly deferred.
- **Impact:** Unknown/expired toolCallId handling (#2) is implemented in extension.ts:446-464 but untested. Concurrent tool calls (#3) exercise the `_pendingPermissions` Map under contention.
- **Remediation:** Implement the 3 todo tests — the source code for all three cases already exists.

### 🟡 Medium: `toolResponse` validation in `_handleMessage` not tested
- **Location:** `src/extension.ts:445-465`
- **Category:** Missing Edge Case Tests
- **Description:** The `toolResponse` handler validates `id` (must be non-empty string) and `approved` (must be boolean, defaults to deny). Invalid inputs trigger `console.warn` and early return. These validation paths are not tested.
- **Impact:** Malformed webview messages could cause unexpected behavior if validation regresses.
- **Remediation:** Test:
  1. toolResponse with empty string id → warn, no crash
  2. toolResponse with missing id → warn, no crash
  3. toolResponse with non-boolean approved → defaults to deny
  4. toolResponse for already-resolved id → warn, no crash

### 🟢 Low: `_getHtmlForWebview()` CSP policy not validated
- **Location:** `src/extension.ts:864-904`
- **Category:** Missing Tests
- **Description:** The HTML template includes a CSP `<meta>` tag with `default-src 'none'`, `style-src`, and `script-src nonce-${nonce}`. No test validates that the CSP string is correctly formed or that it blocks unsafe sources.
- **Impact:** CSP regression (e.g., adding `unsafe-inline`) would go undetected. This is security-relevant per Security Standards §CSP.
- **Remediation:** Test that `_getHtmlForWebview()` output:
  1. Contains `Content-Security-Policy` meta tag
  2. Contains `default-src 'none'`
  3. Does NOT contain `unsafe-inline` or `unsafe-eval`
  4. Contains a nonce in script-src

### 🟢 Low: `activate()` command registration not validated
- **Location:** `src/extension.ts:27-168`
- **Category:** Missing Tests
- **Description:** `activate()` registers 8+ commands (`forge.openSettings`, `forge.showHistory`, `forge.signIn`, `forge.attachSelection`, `forge.attachFile`, `forge.explain`, `forge.fix`, `forge.tests`) plus the webview provider, status bar item, config listener, auth poll interval, and focus listener. No test validates the registration count or command names.
- **Impact:** A missed command registration would be caught by manual testing but not by CI.
- **Remediation:** Test that `activate()` calls `registerCommand` for each expected command name.

### 🟢 Low: Auth polling interval not tested
- **Location:** `src/extension.ts:55-57`
- **Category:** Missing Tests
- **Description:** A `setInterval` polls auth status every 30 seconds and is cleaned up via a `Disposable`. No test verifies the polling starts, fires, or cleans up on deactivation.
- **Impact:** Low — polling is a UX convenience for detecting `az login` completion. Missing poll is not a functional bug.
- **Remediation:** Optional: test that auth poll disposable is in `context.subscriptions`.

### 🟢 Low: Window focus listener not tested
- **Location:** `src/extension.ts:61-64`
- **Category:** Missing Tests
- **Description:** `onDidChangeWindowState` listener triggers auth refresh when window regains focus. Not tested.
- **Impact:** Low — UX convenience only.
- **Remediation:** Optional: test that focus triggers `updateAuthStatus`.

### ℹ️ Info: Mock accuracy assessment
- **`src/test/__mocks__/vscode.ts`** — Accurately models workspace, window, commands, URI, Disposable, CodeActionKind, StatusBarAlignment. Missing: `workspace.fs.readFile` (needed for `forge.attachFile`), `window.showOpenDialog`, `window.showWarningMessage` (needed for `modelChanged`), `window.activeTextEditor`. These are mocked inline in specific test files where needed, which is fine.
- **`src/test/__mocks__/copilot-sdk.ts`** — Accurate. Implements `CopilotClient` with `start/stop/createSession/listSessions/resumeSession/getLastSessionId/deleteSession`. Session mock uses Node `EventEmitter` with `_emit` helper. `constructorSpy` tracks options. No mock drift detected — all 7 SDK methods match the real `CopilotClient` interface.
- **Mock isolation:** `stopClient()` is called in `afterEach` across all test files that import copilotService, ensuring module-level `client` and `sessions` state is reset. Good pattern.

### ℹ️ Info: Test isolation assessment
- **No shared state leaks detected.** Each test file that uses copilotService calls `stopClient()` in `afterEach`. The vscode mock is reset in `beforeEach` where needed. The copilot-sdk mock uses `setMockClient()` per-test.
- **Potential risk:** `extension.test.ts`, `error-scenarios.test.ts`, `multi-turn.test.ts`, `context-attachment.test.ts`, and `tool-approval.test.ts` all call `activate()` in `beforeEach`, which registers WebviewViewProvider and commands. The mock `registerWebviewViewProvider.mockClear()` in `afterEach` handles cleanup, but accumulated `registerCommand` calls from multiple `activate()` invocations could theoretically interfere if test execution order changes. Current behavior is safe because each test captures the *last* registered provider.

### ℹ️ Info: Flaky test potential
- **No timing-dependent tests found.** All async assertions use `vi.waitFor()` with polling, not fixed `setTimeout` delays. Good.
- **Event-driven tests are deterministic** because mock sessions emit events synchronously within `send()` implementations.
- **No test-order dependencies detected.** Each test file is self-contained with proper setup/teardown.

## Priority Summary

| Severity | Count | Action |
|----------|-------|--------|
| 🔴 Critical | 2 | Fix before distribution |
| 🟠 High | 5 | Fix before distribution |
| 🟡 Medium | 8 | Fix if time permits |
| 🟢 Low | 4 | Track for future |
| ℹ️ Info | 3 | Document only |

**Total findings: 22**

Biggest coverage holes are in `extension.ts` (the largest file at 905 lines with many untested branches) and the completely untested `codeActionProvider.ts`. The service layer and auth modules are well-tested.
