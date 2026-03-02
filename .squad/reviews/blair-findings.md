# Extension & Webview Review — Blair

## Summary

The extension and webview code is well-structured with solid error handling, proper CSP, and good separation of concerns. The main concerns are: (1) a race condition where `sendMessageWithContext` bypasses the webview's `streamStart` guard, potentially causing invisible prompts; (2) messages posted to a webview that hasn't been resolved yet are silently dropped, losing context attachments; (3) no webview state persistence across hide/show — users lose visible chat history when switching panels. No critical security issues in my domain — DOMPurify + nonce-based CSP are correct. 15 findings total: 0 critical, 2 high, 7 medium, 4 low, 2 info.

## Findings

### 🟠 High: Race between `sendMessageWithContext` and webview `sendMessage`

- **Location:** src/extension.ts:291-296, media/chat.js:71
- **Category:** Streaming
- **Description:** `sendMessageWithContext()` (used by code action commands like Explain/Fix/Tests) calls `_handleChatMessage()` directly, bypassing the webview's `isStreaming` guard and the `sendMessage` input validation. The `_isProcessing` flag in `_handleChatMessage` (line 476) gates the extension side, but `sendMessageWithContext` does NOT render a user message bubble in the webview — the user won't see what prompt was sent, only the response appearing. Additionally, if a user triggers a code action while already streaming, the extension correctly blocks it via `_isProcessing`, but the webview has no feedback about why nothing happened.
- **Impact:** User confusion — invisible prompt for code action commands. No visual feedback when blocked by in-progress stream.
- **Remediation:** Have `sendMessageWithContext` post a synthetic user message to the webview before streaming (so the user sees the prompt). Post `streamStart` via the webview to keep UI state consistent, or better — post the message to the webview and let the normal message flow handle it.

### 🟠 High: Messages posted before webview is resolved are silently dropped

- **Location:** src/extension.ts:282-284, 298-306
- **Category:** Lifecycle
- **Description:** `postContextAttached()`, `postAuthStatus()`, and `toggleHistory()` all use the optional chaining pattern `this._view?.webview.postMessage(...)`. If the webview hasn't been resolved yet (user hasn't opened the Forge panel), these calls are no-ops. The `forge.attachSelection` and `forge.attachFile` commands can be invoked from the command palette before the panel is open, and the attached context is silently lost. Auth status updates from the 30s poll or config changes are also discarded. When the panel finally opens, `resolveWebviewView` re-fetches auth status, but context attachments are permanently lost.
- **Impact:** User attaches a selection via command palette before opening Forge panel → context silently disappears. Confusing UX.
- **Remediation:** Queue messages when `_view` is undefined and flush them in `resolveWebviewView`. Alternatively, guard the `forge.attachSelection`/`forge.attachFile` commands to reveal the panel first (like `sendFromEditor` does with `forge.chatView.focus` at line 199).

### 🟡 Medium: No webview state persistence across hide/show cycles

- **Location:** src/extension.ts:308-343, media/chat.js (entire file)
- **Category:** Lifecycle
- **Description:** The `WebviewViewProvider` does not set `retainContextWhenHidden`. When the user hides the Forge panel (e.g., switches to Explorer sidebar) and shows it again, VS Code may dispose and re-create the webview. This triggers `resolveWebviewView` again, which sets new HTML, wiping all chat messages, pending context, and streaming state. The `_conversationMessages` array on the extension side survives (it's on the provider instance), but the webview DOM is rebuilt from scratch. The webview does NOT use `vscode.getState()`/`vscode.setState()` for persistence.
- **Impact:** User loses visible chat history when switching sidebar panels. The conversation is alive server-side but UI appears blank.
- **Remediation:** Either (a) set `retainContextWhenHidden: true` in webview options (costs memory but preserves DOM), or (b) use `vscode.getState()`/`vscode.setState()` in `media/chat.js` to serialize the `messages` array and restore on re-init, or (c) post the cached `_conversationMessages` from the extension side in `resolveWebviewView` — like the `conversationResumed` pattern at lines 831-835.

### 🟡 Medium: `conversationResumed` handler doesn't fully reset UI state

- **Location:** media/chat.js:378-386
- **Category:** UI State
- **Description:** The `conversationResumed` handler clears `chatMessages.innerHTML` and sets `currentAssistantMessage = null` and `messages`, but does NOT reset `isStreaming`, `currentAssistantRawText`, `pendingContext`, `contextChipsContainer`, `lastAutoAttachedContent`, `autoAttachedChipElement`, or `autoAttachedCtx`. Compare to `conversationReset` (lines 356-368) which resets all of these. If a conversation is resumed while a stream is in progress or context is pending, the UI state becomes inconsistent.
- **Impact:** After resuming a conversation mid-stream, `isStreaming` stays `true`, input remains disabled, user cannot send messages.
- **Remediation:** Apply the same full state reset in `conversationResumed` as in `conversationReset`. Extract a shared `_resetUIState()` function used by both.

### 🟡 Medium: Tooltip mismatch in status bar for API Key auth

- **Location:** src/extension.ts:228-229
- **Category:** Config
- **Description:** When `config.authMethod` is `"apiKey"` and status is `notAuthenticated`, the status bar text correctly shows `"$(key) Forge: Set API Key"`, but the tooltip reads `"Click to sign in with Azure CLI"` — this is the Entra ID tooltip, copy-pasted into the wrong branch.
- **Impact:** User sees misleading tooltip suggesting Azure CLI when they're configured for API key auth.
- **Remediation:** Change line 229 to `statusBarItem.tooltip = "Click to configure your API key";`.

### 🟡 Medium: Markdown re-parse on every `streamDelta` is O(n²) over response length

- **Location:** media/chat.js:267-277
- **Category:** DOM
- **Description:** `appendDelta()` calls `renderMarkdown(currentAssistantRawText)` and sets `innerHTML` on every single delta token, then calls `addCopyButtons()` to re-scan all `<pre>` blocks. For a long response with hundreds of deltas, the entire accumulated text is re-parsed through `marked.parse()` + `DOMPurify.sanitize()` on each token. The cost grows quadratically with response length since it re-parses the full accumulated text each time.
- **Impact:** Noticeable UI jank on long responses, especially on constrained machines in air-gapped environments.
- **Remediation:** Throttle/debounce the markdown re-render (e.g., 50-100ms). Accumulate raw text between renders. Only do a final render on `streamEnd`. This is a standard pattern in streaming chat UIs.

### 🟡 Medium: `error` message handler doesn't reset `currentAssistantRawText`

- **Location:** media/chat.js:308-313
- **Category:** UI State
- **Description:** The `error` handler resets `currentAssistantMessage`, `isStreaming`, and re-enables input, but does NOT clear `currentAssistantRawText`. If an error occurs mid-stream, the partial raw text persists. `streamStart` resets it (line 289), so this is self-healing, but there's a window where stale data exists.
- **Impact:** Low practical impact since `streamStart` resets it, but a latent inconsistency. If future code reads `currentAssistantRawText` between error and next stream, it gets stale data.
- **Remediation:** Add `currentAssistantRawText = "";` to the `error` handler at line 311.

### 🟡 Medium: `chatFocused` auto-attach has no content size guard

- **Location:** src/extension.ts:423-444
- **Category:** Context
- **Description:** The `chatFocused` handler reads the entire active editor selection and sends it as context. Unlike `forge.attachFile` (which truncates at 8000 chars, line 139), `chatFocused` sends the full selection content regardless of size. A user with a large selection (entire file) would have unbounded content passed to the webview.
- **Impact:** Oversized context in webview memory. Mitigated by `_buildPromptWithContext` budget when actually sent, but the webview stores the full content in `pendingContext`.
- **Remediation:** Apply the same 8000-char truncation in `chatFocused` as in `forge.attachFile`.

### �� Medium: Tool confirmation timeout is silent to the user

- **Location:** src/extension.ts:729-738
- **Category:** Streaming
- **Description:** Tool approval has a 2-minute timeout (line 729). If the user doesn't respond, the timeout auto-denies. But the webview is never notified — the confirmation card remains on screen with active Approve/Reject buttons. Clicking after timeout does nothing (line 458 logs a warning but the card still looks clickable).
- **Impact:** Confusing UX — user sees approval card, leaves, returns, clicks Approve, nothing happens, no feedback.
- **Remediation:** When timeout fires, post a `toolTimeout` message to the webview. In the webview, update the card to show "Timed out — request denied" and disable buttons.

### 🟢 Low: `forge.attachSelection` command doesn't truncate large selections

- **Location:** src/extension.ts:106-128
- **Category:** Context
- **Description:** The `forge.attachSelection` command sends the full selection content without size limit. `forge.attachFile` has an 8000-char limit (line 139), but selections don't. Consistent with the `chatFocused` issue above.
- **Impact:** Mitigated by `_buildPromptWithContext` budget, but webview holds oversized content.
- **Remediation:** Add truncation for selections > 8000 chars, matching file attachment behavior.

### 🟢 Low: `_handleMessage` doesn't handle unknown commands

- **Location:** src/extension.ts:371-472
- **Category:** Message Handling
- **Description:** The `_handleMessage` method uses a chain of `if/else if` statements. Unknown `command` values fall through silently with no warning. Safe defensively, but makes debugging typos difficult.
- **Impact:** Silent failures during development. No production risk.
- **Remediation:** Add `console.warn("[forge] Unknown webview command:", message.command)` in a final `else` branch.

### 🟢 Low: `renderConversationList` and header use `innerHTML` for static content

- **Location:** media/chat.js:129, 135
- **Category:** DOM
- **Description:** Lines 129 and 135 use `innerHTML` for hardcoded strings. No user input involved so no XSS risk, but inconsistent with the rest of the file which uses `textContent` and DOM APIs.
- **Impact:** No security risk. Style inconsistency.
- **Remediation:** Use `textContent` / `document.createElement()` for consistency with the rest of the codebase.

### 🟢 Low: `deactivate` relies on VS Code subscription cleanup for timers

- **Location:** src/extension.ts:244-246
- **Category:** Activation
- **Description:** `deactivate()` only calls `stopClient()`. The auth poll interval (line 55-58) and focus listener are in `context.subscriptions`, so VS Code cleans them up on deactivation. On extension host crash (non-clean deactivation), `deactivate` is not called and SDK sessions don't get a clean abort. This is an inherent VS Code limitation.
- **Impact:** On crash, sessions may not be cleanly aborted. Not a bug — working as designed.
- **Remediation:** No action needed. Document that crash recovery relies on SDK cleanup.

### ℹ️ Info: Copy button `navigator.clipboard.writeText` has no `.catch()`

- **Location:** media/chat.js:256
- **Category:** DOM
- **Description:** `navigator.clipboard.writeText(text).then(...)` has no `.catch()`. If the clipboard API is unavailable in the webview security context, the promise rejection is unhandled.
- **Impact:** Unhandled promise rejection in console. Copy button silently fails.
- **Remediation:** Add `.catch(() => { btn.innerHTML = '<span class="code-copy-feedback">Copy failed</span>'; })`.

### ℹ️ Info: `require("marked")` / `require("dompurify")` in webview relies on esbuild bundling

- **Location:** media/chat.js:2-3
- **Category:** Lifecycle
- **Description:** The webview uses `require("marked")` and `require("dompurify")` at top level. This works because esbuild bundles `media/chat.js` → `dist/chat.js` (confirmed in esbuild.config.mjs). The extension HTML loads `dist/chat.js` (extension.ts:869). If someone loads the unbundled `media/chat.js`, `require` is unavailable in webview context and crashes.
- **Impact:** No runtime impact — build is configured correctly. Development-time footgun.
- **Remediation:** Add a comment at the top of `media/chat.js` noting it must be bundled.
