# Norris — History

## Project Context
- **Project:** Forge — VS Code extension for AI chat in air-gapped environments via Azure AI Foundry
- **Stack:** TypeScript, VS Code Extension API, @github/copilot-sdk, esbuild, vitest
- **Owner:** Rob Pitcher
- **Joined:** 2026-03-02

## Learnings

### 2026-03-02: Initial Security Audit (#112)
- **CSP is strong:** `default-src 'none'` with nonce-based `script-src`, no `unsafe-inline` or `unsafe-eval`. No CDN sources. Template at `src/extension.ts:879`.
- **XSS is well-handled:** All markdown rendering goes through `DOMPurify.sanitize(marked.parse(text))` in `media/chat.js:renderMarkdown()`. User-facing text uses `textContent`.
- **Secrets are properly stored:** API keys only in `SecretStorage`, never in settings.json or logs. `configuration.ts:31` returns empty string for apiKey in sync getter.
- **Air-gap compliance verified:** No external network calls in source. URL tool defaults to off. Remote MCP defaults to disabled.
- **npm audit: 0 vulnerabilities** as of audit date.
- **Medium findings:** (1) CSS selector injection via `message.id` in querySelector calls, (2) Entra ID bearer token static-string limitation (#27), (3) No HTTPS validation on endpoint URL, (4) MCP command config trust surface.
- **Key file map for future audits:** CSP in `src/extension.ts:_getHtmlForWebview()`, secrets in `src/configuration.ts:getConfigurationAsync()`, auth in `src/auth/credentialProvider.ts`, DOM rendering in `media/chat.js`.

### 2026-07-14: Comprehensive Re-Audit (#112)
- **All four original medium findings still open.** No fixes applied since initial audit.
- **New medium finding:** Conversation history `sessionId` from webview not format-validated before passing to SDK `resumeSession()`/`deleteSession()`. Low practical risk but violates trust boundary principle.
- **New features audited clean:** Conversation history (list/resume/delete), model selector, tool progress/partial result indicators, code action provider, auth banner — all follow safe DOM patterns (`textContent`, `createElement`, DOMPurify for markdown).
- **npm audit still clean:** 0 vulnerabilities.
- **No new external network calls introduced.** Conversation history operations are local SDK file operations.
- **decodeJwtPayload in authStatusProvider.ts** is safely wrapped in try/catch, never logs raw tokens.
- **Updated file map:** Conversation history at `src/extension.ts:770-861`, code actions at `src/codeActionProvider.ts`, auth banner at `media/chat.js:580-655`.
