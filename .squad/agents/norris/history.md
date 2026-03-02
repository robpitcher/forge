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
