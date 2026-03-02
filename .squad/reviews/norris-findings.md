# Security Review — Norris

**Date:** 2026-03-02 (updated 2026-07-14)
**Scope:** Full codebase audit for issue #112 — comprehensive re-audit
**Files Reviewed:** src/extension.ts, src/copilotService.ts, src/configuration.ts, src/types.ts, src/auth/credentialProvider.ts, src/auth/authStatusProvider.ts, src/codeActionProvider.ts, media/chat.js, media/chat.css, package.json, esbuild.config.mjs

## Summary

The Forge codebase maintains a **strong security posture**. CSP uses nonce-based script loading with `default-src 'none'`, DOMPurify sanitizes all markdown-rendered HTML, secrets use VS Code SecretStorage exclusively, and `npm audit` reports zero vulnerabilities. New features (conversation history, model selector, tool progress, code actions, auth banner) follow existing safe patterns. No critical or high-severity vulnerabilities found. Four medium-severity defense-in-depth findings remain from the initial audit, plus one new medium finding on conversation history `sessionId` validation.

## Findings

### 🟡 Medium: CSS Selector Injection via Unsanitized `message.id` in querySelector

- **Location:** media/chat.js:348, 520, 545
- **Category:** Input Validation / XSS
- **Description:** Three `querySelector` calls interpolate `message.id` directly into CSS attribute selectors without escaping:
  ```js
  document.querySelector(`.tool-progress[data-tool-id="${message.id}"]`);
  ```
  The `message.id` originates from SDK `toolCallId` values (or `crypto.randomUUID()` fallback). While the extension host controls these values (src/extension.ts:648, 658, 668, 720), a malformed `toolCallId` from the SDK containing `"]` could break the selector or cause unexpected DOM lookups.
- **Impact:** If a crafted `toolCallId` contained CSS selector metacharacters like `"]`, it could cause the selector to match unintended elements or throw. This is defense-in-depth — the SDK likely produces safe IDs, but the code should not assume this.
- **Remediation:** Use `CSS.escape(message.id)` before interpolation:
  ```js
  document.querySelector(`.tool-progress[data-tool-id="${CSS.escape(message.id)}"]`);
  ```

### 🟡 Medium: Bearer Token Refresh Gap (Entra ID)

- **Location:** src/copilotService.ts:74-84, src/auth/credentialProvider.ts:29-34
- **Category:** Auth
- **Description:** The Copilot SDK's `bearerToken` field accepts only a static string — no refresh callback. A token is fetched once at session creation via `DefaultAzureCredential.getToken()` and passed as a static value. Azure Entra ID tokens typically expire after ~1 hour. If a session lives longer than the token lifetime, API calls will fail with 401.
- **Impact:** Long-running conversations (>1 hour) using Entra ID auth will start failing silently or with auth errors. The session-per-conversation model mitigates this since new sessions get fresh tokens, but a single long conversation is vulnerable.
- **Remediation:** This is a known SDK limitation (tracked as #27). Document the ~1 hour session lifetime limit for Entra ID users. Consider proactive session rotation before token expiry, or intercepting 401 errors to destroy and re-create the session with a fresh token.

### 🟡 Medium: No Endpoint URL Validation

- **Location:** src/configuration.ts:63-69
- **Category:** Input Validation
- **Description:** `validateConfiguration()` checks only that `config.endpoint` is non-empty. It does not validate that the endpoint is a well-formed HTTPS URL. A user could configure `endpoint` to a non-HTTPS URL (e.g., `http://...`), a file:// URL, or a malformed string. The value is passed directly to the SDK's `baseUrl` field (src/copilotService.ts:81).
- **Impact:** Could cause confusing errors if the SDK receives a malformed URL. More importantly, using `http://` in a production environment would transmit API keys/tokens in plaintext, defeating air-gap security posture.
- **Remediation:** Add URL validation in `validateConfiguration()`:
  ```typescript
  try {
    const url = new URL(config.endpoint);
    if (url.protocol !== "https:") {
      errors.push({ field: "forge.copilot.endpoint", message: "Endpoint must use HTTPS." });
    }
  } catch {
    errors.push({ field: "forge.copilot.endpoint", message: "Endpoint must be a valid URL." });
  }
  ```

### 🟡 Medium: MCP Server Command Injection Surface

- **Location:** src/copilotService.ts:112-119, src/configuration.ts:133-162
- **Category:** Input Validation
- **Description:** Local MCP server configs accept `command`, `args`, and `env` from VS Code settings (`settings.json`). These are passed to the SDK which spawns the process. While settings.json is user-controlled (so this is a self-attack vector), the validation only checks types — it does not restrict which commands can be executed or warn about dangerous commands.
- **Impact:** If an attacker can modify workspace-level `.vscode/settings.json` (e.g., via a malicious git repo clone), they could configure an MCP server with arbitrary commands that execute when Forge activates. This is analogous to VS Code's own terminal and task trust prompts.
- **Remediation:** Consider adding a trust prompt before spawning MCP servers from workspace settings (similar to VS Code's "Do you trust the authors of this workspace?"). At minimum, log which MCP commands are being spawned. The `autoApproveTools: false` default helps, but MCP server *startup* is not gated by tool approval.

### 🟡 Medium: Conversation History `sessionId` Not Format-Validated

- **Location:** src/extension.ts:469, 471, 781-840, 842-861
- **Category:** Input Validation / Trust Boundary
- **Description:** The `resumeConversation` and `deleteConversation` webview message handlers receive `sessionId` as an untyped value from the webview (`message.sessionId as string`). The only validation is `if (!sessionId)` (empty/falsy check). The raw string is passed directly to the SDK's `resumeSession()` and `deleteSession()` methods and used as a `workspaceState` cache key (`forge.messages.${sessionId}`).
- **Impact:** A compromised or buggy webview could send arbitrary strings as `sessionId`, potentially causing unexpected SDK behavior or polluting workspaceState with keys containing special characters. Practical risk is low since the webview is sandboxed and extension-controlled, but this violates the trust boundary principle of validating all inputs from less-trusted contexts.
- **Remediation:** Validate `sessionId` format before use — e.g., ensure it matches a UUID or expected pattern:
  ```typescript
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 100) {
    this._postError("Invalid session ID");
    return;
  }
  ```

### 🟢 Low: `innerHTML` with Static Content (No Risk)

- **Location:** media/chat.js:83, 92, 95, 125, 129, 135, 252, 257, 259, 357, 363, 379, 389, 499, 590
- **Category:** XSS
- **Description:** Many `innerHTML` assignments either clear content (`= ""`) or use static HTML strings (SVG copy button, conversation list header, "No saved conversations"). These are safe because no user data is interpolated. The `conversationReset` handler (line 357) and `conversationResumed` handler (line 379) safely clear before re-rendering via `appendMessage`.
- **Impact:** None — these are safe patterns.
- **Remediation:** No action needed.

### 🟢 Low: `renderMarkdown()` Properly Sanitized

- **Location:** media/chat.js:239-242, 193, 274
- **Category:** XSS
- **Description:** All markdown rendering goes through `DOMPurify.sanitize(marked.parse(text))`. This is the correct pattern. The sanitized output is assigned via `innerHTML` at lines 193 and 274. Both `marked` (v17.0.3) and `dompurify` (v3.3.1) are current versions. The `conversationResumed` handler (line 383-385) re-renders restored assistant messages through `appendMessage`, which uses this same safe path.
- **Impact:** XSS risk from AI-generated markdown content is properly mitigated.
- **Remediation:** No action needed. Continue to ensure all new innerHTML assignments with dynamic content use this `renderMarkdown()` path.

### 🟢 Low: Tool Confirmation & Progress Display Uses Safe DOM APIs

- **Location:** media/chat.js:443, 478, 519-577
- **Category:** XSS
- **Description:** Tool confirmation card renders tool name and params using `textContent`, safe against XSS. The `formatParamValue` function truncates long values to prevent DoS. Tool progress indicators (line 537-540) set label text via `textContent`. Partial result output (line 574) appends via `createTextNode`. All safe patterns.
- **Impact:** None.
- **Remediation:** No action needed.

### 🟢 Low: Conversation List Renders Safely

- **Location:** media/chat.js:124-178
- **Category:** XSS
- **Description:** `renderConversationList` creates DOM elements programmatically. Conversation summaries (line 150) and timestamps (line 154) use `textContent`. Delete buttons (line 160-162) use `textContent`. The only `innerHTML` is a static string for the "No saved conversations" message (line 129) and the header (line 135). Safe pattern.
- **Impact:** None.
- **Remediation:** No action needed.

### 🟢 Low: Auth Banner Renders Safely

- **Location:** media/chat.js:580-655
- **Category:** XSS
- **Description:** `updateAuthBanner` creates interactive elements (buttons) using `createElement` and `textContent`/`createTextNode`. The error message is truncated to 80 chars and rendered via `textContent` (line 646). No user-controlled data reaches `innerHTML`.
- **Impact:** None.
- **Remediation:** No action needed.

### 🟢 Low: Model Selector Renders Safely

- **Location:** media/chat.js:389-398
- **Category:** XSS
- **Description:** The `modelsUpdated` handler creates `<option>` elements using `createElement` and sets `opt.textContent = m`. Model names come from the extension host's config. Safe pattern.
- **Impact:** None.
- **Remediation:** No action needed.

### ℹ️ Info: CSP Policy is Correctly Configured

- **Location:** src/extension.ts:879
- **Category:** CSP
- **Description:** The Content Security Policy is well-configured:
  ```
  default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';
  ```
  - `default-src 'none'` — blocks all resources not explicitly allowed
  - No `unsafe-inline` or `unsafe-eval` — scripts require a nonce
  - No CDN or external sources — air-gap compliant
  - Nonce generated via `crypto.randomUUID()` — sufficient entropy
  - `img-src` is not whitelisted, which means markdown images from AI responses won't render (acceptable for air-gap compliance)
  - No `eval()`, `Function()`, or dynamic code execution found anywhere in the codebase
- **Impact:** Positive — this is a strong CSP.
- **Remediation:** No action needed.

### ℹ️ Info: Secret Management is Correct

- **Location:** src/configuration.ts:48-55, src/auth/credentialProvider.ts:68, src/extension.ts:365
- **Category:** Secrets
- **Description:** API keys are exclusively managed through VS Code's `SecretStorage`:
  - `getConfigurationAsync()` reads keys only from `secrets.get("forge.copilot.apiKey")`
  - `_promptAndStoreApiKey()` stores via `secrets.store()` with `password: true` in the input box
  - `configuration.ts:31` returns `apiKey: ""` for the sync config getter — never reads from settings
  - No API keys appear in `console.log/warn/error` calls — the `console.warn` calls in copilotService.ts only log session IDs and error messages, never tokens
  - No secrets in URLs or query parameters
  - `authStatusProvider.ts:decodeJwtPayload()` only extracts identity claims (upn, name) — never logs the raw token
- **Impact:** Positive — secrets are properly handled.
- **Remediation:** No action needed.

### ℹ️ Info: Air-Gap Compliance Verified

- **Location:** All source files
- **Category:** Air-Gap
- **Description:** Verified that no source files make external network calls:
  - No `fetch()`, `XMLHttpRequest`, `axios`, `got`, or `node-fetch` in source files
  - No CDN links in webview HTML (CSP blocks them anyway)
  - No telemetry or analytics code
  - The only network calls go through the Copilot SDK to the user-configured endpoint
  - esbuild bundles all dependencies (both extension and webview) — no runtime CDN fetches
  - MCP remote servers are gated behind `allowRemoteMcp: false` default
  - The `tools.url` setting defaults to `false` for air-gap safety
  - Conversation history operations (list/resume/delete) are local SDK file operations, not network calls
- **Impact:** Positive — fully air-gap compliant.
- **Remediation:** No action needed.

### ℹ️ Info: Webview ↔ Extension Trust Boundary

- **Location:** src/extension.ts:371-472, media/chat.js:279-406
- **Category:** Trust Boundary
- **Description:** Message validation at the trust boundary is adequate:
  - Extension validates `command` field as string before dispatch
  - Context items are validated with type guards (lines 374-381)
  - `toolResponse` validates `id` is a string and `approved` is boolean (lines 447-465)
  - No `eval()` or dynamic code execution on either side
  - `localResourceRoots` restricts webview file access to `_extensionUri` only
  - `enableScripts: true` is necessary and secured by the CSP nonce
  - New conversation commands (`listConversations`, `resumeConversation`, `deleteConversation`) properly pass through to SDK with error handling
- **Impact:** Positive — the trust boundary is reasonably well-guarded.
- **Remediation:** Consider adding a `command` allowlist check to `_handleMessage()` to reject unknown commands early. See also the `sessionId` validation finding above.

### ℹ️ Info: Code Action Provider is Safe

- **Location:** src/codeActionProvider.ts
- **Category:** Input Validation
- **Description:** `ForgeCodeActionProvider` only creates VS Code `CodeAction` objects with hardcoded command IDs and titles. No user input is processed, no DOM manipulation, no network calls. The `sendFromEditor` function (src/extension.ts:175-202) reads selection content from the active editor, which is inherently trusted content.
- **Impact:** None.
- **Remediation:** No action needed.

## npm audit Results

```
found 0 vulnerabilities
```

All dependencies are clean. Key security-relevant dependency versions:
- `dompurify@^3.3.1` — current, actively maintained XSS sanitizer
- `marked@^17.0.3` — current markdown parser
- `@azure/identity@^4.13.0` — current Azure auth SDK
- `@github/copilot-sdk@0.1.26` — pinned version (Technical Preview)

No `eval`, `Function()`, or `unsafe-inline`/`unsafe-eval` patterns found in source code.

## Summary Table

| # | Severity | Title | Category | Status |
|---|----------|-------|----------|--------|
| 1 | 🟡 Medium | CSS Selector Injection via `message.id` | Input Validation | Open |
| 2 | 🟡 Medium | Bearer Token Refresh Gap (Entra ID) | Auth | Open (#27) |
| 3 | 🟡 Medium | No Endpoint URL Validation | Input Validation | Open |
| 4 | 🟡 Medium | MCP Server Command Injection Surface | Input Validation | Open |
| 5 | 🟡 Medium | Conversation `sessionId` Not Validated | Trust Boundary | **New** |
| 6 | 🟢 Low | `innerHTML` with Static Content | XSS | Pass ✓ |
| 7 | 🟢 Low | `renderMarkdown()` Properly Sanitized | XSS | Pass ✓ |
| 8 | 🟢 Low | Tool Display Uses Safe DOM APIs | XSS | Pass ✓ |
| 9 | 🟢 Low | Conversation List Renders Safely | XSS | Pass ✓ |
| 10 | 🟢 Low | Auth Banner Renders Safely | XSS | Pass ✓ |
| 11 | 🟢 Low | Model Selector Renders Safely | XSS | Pass ✓ |
| 12 | ℹ️ Info | CSP Policy Correctly Configured | CSP | Pass ✓ |
| 13 | ℹ️ Info | Secret Management Correct | Secrets | Pass ✓ |
| 14 | ℹ️ Info | Air-Gap Compliance Verified | Air-Gap | Pass ✓ |
| 15 | ℹ️ Info | Trust Boundary Adequate | Trust Boundary | Pass ✓ |
| 16 | ℹ️ Info | Code Action Provider Safe | Input Validation | Pass ✓ |

**Overall Assessment:** The codebase maintains a strong security posture for an air-gapped VS Code extension. No critical or high-severity findings. Five medium-severity items are defense-in-depth improvements. All new features (conversation history, model selector, tool progress, code actions, auth banner) follow the established safe patterns. The XSS surface is well-controlled via DOMPurify + CSP nonce.
