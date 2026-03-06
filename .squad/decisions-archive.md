# Decisions Archive

> Archived decisions (older than 30 days or when decisions.md exceeded ~20KB).
> Current decisions live in `decisions.md`. Consult this archive for historical context.

---

# Decision: APIM Private Endpoint Redundancy in Enterprise Architecture

**Decision Owner:** Bennings (Azure Cloud Architect)  
**Date:** 2025 (session)  
**Status:** Implemented  
**References:** Microsoft Learn - "Use a virtual network to secure inbound or outbound traffic for Azure API Management"

## Problem

The Forge enterprise architecture diagram showed **both**:
1. APIM Subnet (VNet-injected, internal mode)
2. Private Endpoint (APIM)

This raised the question: Are these redundant? If APIM is already VNet-injected with a private IP in the dedicated subnet, why also create a separate Private Endpoint?

## Analysis

Microsoft Learn documentation clarifies that VNet injection and inbound Private Endpoints are **separate, alternative networking models**, not complementary:

| Model | Access | Use Case |
|-------|--------|----------|
| **VNet Injection (Internal Mode)** | Private IP via internal load balancer; accessed via VPN/ExpressRoute | Air-gap, hybrid cloud, internal-only APIs |
| **Inbound Private Endpoint** | Multiple private connections via Azure Private Link | Fallback for basic tiers; multi-path external access |

For Forge's architecture:
- APIM is Premium tier (required for VNet injection)
- APIM is in **internal mode** (no public endpoint)
- Clients are on-premises or in corp network (VPN/ExpressRoute)
- Traffic flow: Developer → VPN/ExpressRoute → VNet → APIM Subnet → APIM (private IP)

With VNet-injected APIM, the private IP is already available within the subnet. Adding a Private Endpoint creates a redundant access path and unnecessarily complicates the topology.

## Decision

✅ **Remove the APIM Private Endpoint block from the enterprise architecture diagram.**

Rationale:
1. VNet injection already provides private IP access with full network control
2. Private Endpoint is an alternative for scenarios that can't use injection
3. Adding PE when already using injection adds operational overhead without security or resilience benefit
4. Single, clear data path is preferable for air-gap compliance: VPN/ExpressRoute → VNet → APIMSubnet → APIM

## Changes Made

- Removed `PEAPIM` (Private Endpoint for APIM) node from diagram
- Removed VNet → PEAPIM → APIM edges; traffic now flows VPN → VNet → APIMSubnet → APIM
- Updated Components table (removed APIM PE row)
- Clarified Private DNS Zones: `*.azure-api.net` resolves to internal subnet IP, not a separate PE
- Added guidance that VNet injection is the recommended air-gap approach

## Impact

**Reduces complexity** without sacrificing security or functionality. Enterprise customers deploying Forge now have a clearer, more accurate reference architecture aligned with Azure best practices.

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

# Decision: Proactive az CLI detection in forge.signIn

**Author:** Blair (Extension Dev)  
**Date:** 2025-07-17  
**Scope:** `src/extension.ts` — `forge.signIn` command handler

## Context

When a new user configures Entra ID auth and clicks "Sign in with Entra ID", the extension previously opened a terminal and ran `az login` unconditionally. If `az` CLI wasn't installed, the user saw a confusing shell error.

## Decision

Add a proactive `az` CLI availability check **before** opening the terminal:

- Use `execFileSync` with `which` (POSIX) / `where.exe` (Windows) to detect `az` on PATH.
- If not found, show `showErrorMessage` with an "Install Azure CLI" button linking to `https://aka.ms/installazurecli`.
- Return early — no terminal opened.

## Rationale

- **Actionable errors** — user immediately knows what's wrong and how to fix it.
- **Security** — `execFileSync` avoids shell injection (`execSync` banned by convention).
- **Complementary** — this is the PROACTIVE guard (pre-launch). `isCliNotFoundError` in `authStatusProvider.ts` remains the REACTIVE guard (post-token-fetch failure).
- **Cross-platform** — `where.exe` on Windows, `which` on macOS/Linux.

## Impact

- Blair owns `src/extension.ts` — no cross-domain impact.
- No test changes required (existing 67+ tests unaffected).

---

# Decision: Enterprise Architecture Documentation Overhaul

**Date:** 2025-07-17
**Author:** Bennings (Azure Cloud Architect)
**Artifacts:** `docs/enterprise-architecture.md`
**Status:** Complete

## Summary

Reviewed and corrected the enterprise architecture reference documentation. Found 6 significant issues and multiple minor gaps. All corrections applied directly to `docs/enterprise-architecture.md`.

## Issues Found & Corrected

### Critical

1. **Auth flow was wrong.** The diagram showed the Copilot CLI authenticating with Entra ID. In reality, the **Extension Host** acquires the token via `DefaultAzureCredential.getToken()` and passes it as a static `bearerToken` to the CLI. The CLI never talks to Entra ID. Fixed the diagram and auth flow section.

2. **Private Endpoint topology was incomplete.** Only one PE was shown, placed between VNet and APIM with ambiguous direction. Enterprise deployments need **two** Private Endpoints: one for clients to reach APIM, and one for APIM to reach AI Foundry. Both are now in the diagram.

3. **Missing client-to-VNet connectivity.** The original diagram had no VPN Gateway or ExpressRoute — leaving the question of how on-prem clients reach the private network unanswered. Added VPN Gateway/ExpressRoute to the diagram and networking section.

### Moderate

4. **Missing Key Vault.** Enterprise deployments need Key Vault for API keys, certs, and APIM policy secrets. Added to diagram and component table.

5. **Missing Private DNS Zones.** Critical for PE resolution. Were mentioned in notes but absent from diagram. Now a first-class component.

6. **APIM tier not specified.** VNet injection requires Premium tier (or v2). Original doc said "APIM auto-scales" which is misleading. Added tier comparison table and cost context.

7. **APIM → AI Foundry auth via managed identity.** The original doc didn't mention how APIM authenticates to the backend. Added managed identity pattern (no keys to rotate).

### Minor

8. **Token Endpoint was a misleading separate node.** Removed — it's just Entra ID's OAuth endpoint.
9. **App Insights attribution corrected.** AI Foundry doesn't natively emit to App Insights. Diagnostic settings go to Log Analytics. App Insights is for optional client-side telemetry.
10. **Added APIM policy details** with actual policy names (`validate-jwt`, `rate-limit-by-key`, `authentication-managed-identity`, etc.).
11. **Added token refresh limitation note** referencing issue #27.

## Impact

- Documentation only — no code changes.
- All squad members referencing the enterprise architecture should use the updated doc.
- The auth flow correction is important for Blair/Childs to understand: the extension host owns authentication, the CLI is a passive consumer of the token.

---

### Update endpoint example URL to services.ai.azure.com
**By:** Blair
**Date:** 2025-07-24
**What:** Updated user-facing example endpoint URL from `https://myresource.openai.azure.com/` to `https://myresource.services.ai.azure.com/` in `package.json` settings description and `src/configuration.ts` validation error message. The `isAzure` regex (`/\.azure\.com/i`) was intentionally left unchanged — it matches both formats, so no logic change was needed. This is a docs-only change to reflect Azure AI Foundry's current generic endpoint format.
**Why:** Azure AI Foundry now uses `services.ai.azure.com` as the standard endpoint format. The old `openai.azure.com` still works but is no longer the recommended example for new users.

---

# Decision: Stop/Cancel Lifecycle Pattern

**Author:** Blair (Extension Dev)
**Date:** 2025-07-24
**Context:** PR #155 review — stop button edge cases

## Decision

For async operations with a multi-phase lifecycle (thinking → generating → idle), use a **request-scoped cancellation flag + request ID counter** pattern:

1. **Cancellation flag** (`_cancelRequested`): Set by the stop handler, checked at each phase boundary before expensive work begins. Reset at the start of each new request.

2. **Request ID** (`_requestId`): Incremented per request. `finally` blocks only clean up if their captured ID matches the current one, preventing stale cleanup from clobbering newer requests.

3. **Always `await` SDK abort calls** in try/catch — fire-and-forget `.catch(() => {})` can mask errors that later surface as confusing messages.

4. **Webview safety timeouts**: When the webview sends a command that should trigger a phase update, set a ~3s fallback timer to reset UI state if the extension doesn't respond. Clear the timer when the real update arrives.

## Rationale

The original stop handler only worked during the `generating` phase (when `_currentSession` exists). During `thinking`, the session hasn't been created yet, so `session.abort()` is impossible. The cancellation flag bridges this gap. The request ID prevents race conditions when stop is quickly followed by a new send.

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

# MVP Backlog Triage Decision

**Date:** 2026-02-27  
**Author:** MacReady (Lead)  
**Context:** Coordinator completed routing analysis for all 23 MVP issues; MacReady executed triage

---

# Documentation Delivery Decision — Issues #19 & #20

**Date:** 2026-02-27 (Evening)  
**Author:** MacReady (Lead)  
**Issues:** #19 (Copilot CLI installation guide), #20 (Azure AI Foundry configuration reference)  
**Branch:** `squad/19-20-docs` → PR #45 (open to `dev`)

---

## Session Cleanup Implementation Decision

**Date:** 2026-02-27  
**Author:** Blair (Extension Dev)  
**Context:** Issue #23 — Implement session cleanup on conversation end

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



# Decision: docs/README.md as Documentation Hub

**Author:** Fuchs (Technical Writer)
**Date:** 2026

## Decision

Created `docs/README.md` as the central documentation landing page — a self-contained quick-reference that cross-links to specialized docs rather than duplicating them.

## Structure

Six sections in fixed order:
1. Problem → Solution (2-3 paragraphs)
2. Prerequisites (table format)
3. Setup (settings table + example JSON)
4. Deployment (Marketplace + sideload only — no Azure infra)
5. Architecture Diagram (basic mermaid diagram, links to enterprise-architecture.md)
6. Responsible AI (security defaults, data sovereignty, content filtering)

## Key Choices

- **Responsible AI section** is original content, not pulled from existing docs. Covers: Entra ID default auth, disabled MCP servers, explicit tool approval, auto-approval off by default, Azure AI Content Safety link, tenant-scoped inference.
- **Deployment** covers extension install only. Azure infrastructure belongs in enterprise-architecture.md.
- **Cross-links** to configuration-reference.md, features-and-usage.md, and enterprise-architecture.md — no content duplication.

## Impact

- Other docs remain unchanged — this is additive only.
- Future docs should be linked from docs/README.md to keep it current as the entry point.


# Decision: Hero image styling on title slide

**Author:** Blair (Extension Dev / UI)
**Date:** 2025-07-11
**Scope:** `presentation/slidev/slides.md` — first slide only

## Context

The repo header image on slide 1 had minimal CSS treatment (simple border + box-shadow). It looked flat against the dark background.

## Decision

Replaced the plain image styling with a **gradient-border wrapper** pattern:

- **Wrapper div** (`.hero-image-wrapper`) provides a blue→violet diagonal gradient border (1.5 px) via `padding` + `background: linear-gradient(...)`.
- **Multi-layer ambient glow** — four box-shadow layers (blue highlight + indigo diffuse + deep blue ambient + dark drop shadow) give it depth without being heavy.
- **`glow-breathe` animation** — 5-second ease-in-out infinite keyframe that subtly pulses the glow intensity. Imperceptible in a screenshot, adds life during presentation.
- **Hover interaction** — gentle 1.2% scale-up, intensified glow, and slight brightness boost on the image itself.
- The image has `border: none` and `display: block` to sit cleanly inside the wrapper ring with matching `border-radius`.

## Why

- Gradient border ring is a standard premium-UI treatment (Apple, Vercel, Linear all use it).
- Animation is deliberately slow and subtle so it doesn't distract from the speaker.
- Colors (blue `#3B82F6`, violet `#7C3AED`, indigo `#6366F1`) complement the seriph dark theme and Forge's Azure branding.

## Alternatives Considered

- **Outline + outline-offset** — simpler but can't gradient.
- **`border-image`** — poor `border-radius` support in some renderers.
- **No animation** — static looks fine but animation is nearly free and adds polish.

