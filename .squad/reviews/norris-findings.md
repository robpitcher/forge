# Security Review — Norris

**Date:** 2026-03-02
**Scope:** Full codebase audit for issue #112
**Files Reviewed:** src/extension.ts, src/copilotService.ts, src/configuration.ts, src/types.ts, src/auth/credentialProvider.ts, src/auth/authStatusProvider.ts, src/codeActionProvider.ts, media/chat.js, media/chat.css, package.json, esbuild.config.mjs

## Summary

The Forge codebase demonstrates **solid security fundamentals** — CSP is well-configured with nonce-based script loading, DOMPurify sanitizes all markdown-rendered HTML, secrets use VS Code SecretStorage, and there are zero npm audit vulnerabilities. The main concerns are around CSS selector injection in querySelector calls using unsanitized SDK-provided IDs, the bearer token refresh gap inherent to the Copilot SDK's static-string-only `bearerToken` field, and missing endpoint URL validation. No critical vulnerabilities were found.

## Findings

### 🟡 Medium: CSS Selector Injection via Unsanitized `message.id` in querySelector

- **Location:** media/chat.js:348, 520, 545
- **Category:** Input Validation / XSS
- **Description:** Three `querySelector` calls interpolate `message.id` directly into CSS attribute selectors without escaping:
  ```js
  document.querySelector(`.tool-progress[data-tool-id="${message.id}"]`);
  ```
  The `message.id` originates from SDK `toolCallId` values (or `crypto.randomUUID()` fallback). While the extension host controls these values (src/extension.ts:650, 660, 671, 720), a malformed `toolCallId` from the SDK containing `"]` could break the selector or cause unexpected DOM lookups.
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

### 🟢 Low: `innerHTML` with Static Content (No Risk)

- **Location:** media/chat.js:129, 135, 252, 257, 259
- **Category:** XSS
- **Description:** Several `innerHTML` assignments use static HTML strings (e.g., the SVG copy button, conversation list header, "No saved conversations" message). These are safe because no user data is interpolated.
- **Impact:** None — these are safe patterns.
- **Remediation:** No action needed. For consistency, consider using `createElement` for the conversation list header (line 135), but this is cosmetic.

### 🟢 Low: `renderMarkdown()` Properly Sanitized

- **Location:** media/chat.js:239-242, 193, 274
- **Category:** XSS
- **Description:** All markdown rendering goes through `DOMPurify.sanitize(marked.parse(text))`. This is the correct pattern. The sanitized output is assigned via `innerHTML` at lines 193 and 274. Both `marked` (v17.0.3) and `dompurify` (v3.3.1) are current versions.
- **Impact:** XSS risk from AI-generated markdown content is properly mitigated.
- **Remediation:** No action needed. Continue to ensure all new innerHTML assignments with dynamic content use this `renderMarkdown()` path.

### 🟢 Low: Tool Confirmation Params Display Uses `textContent`

- **Location:** media/chat.js:443, 478
- **Category:** XSS
- **Description:** Tool confirmation card renders the tool name (`header.textContent = ...`) and params (`params.textContent = ...`) using `textContent`, which is safe against XSS. The `formatParamValue` function truncates long values to prevent DoS. Good pattern.
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
- **Impact:** Positive — this is a strong CSP.
- **Remediation:** No action needed.

### ℹ️ Info: Secret Management is Correct

- **Location:** src/configuration.ts:48-55, src/auth/credentialProvider.ts:68, src/extension.ts:365
- **Category:** Secrets
- **Description:** API keys are exclusively managed through VS Code's `SecretStorage`:
  - `getConfigurationAsync()` reads keys only from `secrets.get("forge.copilot.apiKey")`
  - `_promptAndStoreApiKey()` stores via `secrets.store()` with `password: true` in the input box
  - `configuration.ts:31` returns `apiKey: ""` for the sync config getter — never reads from settings
  - No API keys appear in `console.log/warn/error` calls — the `console.warn` calls in copilotService.ts only log session IDs and error messages
  - No secrets in URLs or query parameters
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
  - esbuild bundles all dependencies — no runtime CDN fetches
  - MCP remote servers are gated behind `allowRemoteMcp: false` default
  - The `tools.url` setting defaults to `false` for air-gap safety
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
- **Impact:** Positive — the trust boundary is reasonably well-guarded.
- **Remediation:** No action needed, but consider adding a `command` allowlist check to `_handleMessage()` to reject unknown commands early.

### ℹ️ Info: `error` Message Uses `textContent`

- **Location:** media/chat.js:309
- **Category:** XSS
- **Description:** Error messages from the extension are rendered via `appendMessage("error", ...)` which uses `contentDiv.textContent = content` for non-assistant roles (line 196). This is safe — error messages cannot inject HTML.
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

## Summary Table

| # | Severity | Title | Category |
|---|----------|-------|----------|
| 1 | 🟡 Medium | CSS Selector Injection via `message.id` | Input Validation |
| 2 | 🟡 Medium | Bearer Token Refresh Gap (Entra ID) | Auth |
| 3 | 🟡 Medium | No Endpoint URL Validation | Input Validation |
| 4 | 🟡 Medium | MCP Server Command Injection Surface | Input Validation |
| 5 | 🟢 Low | `innerHTML` with Static Content | XSS |
| 6 | 🟢 Low | `renderMarkdown()` Properly Sanitized | XSS |
| 7 | 🟢 Low | Tool Params Uses `textContent` | XSS |
| 8 | ℹ️ Info | CSP Policy Correctly Configured | CSP |
| 9 | ℹ️ Info | Secret Management Correct | Secrets |
| 10 | ℹ️ Info | Air-Gap Compliance Verified | Air-Gap |
| 11 | ℹ️ Info | Trust Boundary Adequate | Trust Boundary |
| 12 | ℹ️ Info | Error Messages Use `textContent` | XSS |

**Overall Assessment:** The codebase has a strong security posture for an air-gapped VS Code extension. No critical or high-severity findings. The four medium-severity items are all defense-in-depth improvements that would harden the extension further.
