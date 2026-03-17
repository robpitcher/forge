# Agents

Instructions for AI coding agents working on this repository.

## Project

**Forge** is a VS Code extension that provides AI chat for air-gapped environments via Azure AI Foundry. It uses the `@github/copilot-sdk` in BYOK (Bring Your Own Key) mode to route inference to a private endpoint — no GitHub auth, no internet.

**Stack:** TypeScript · VS Code Extension API · `@github/copilot-sdk` · esbuild · vitest

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Bundle extension via esbuild |
| `npm test` | Run vitest test suite |
| `npx tsc --noEmit` | TypeScript type-check (no emit) |
| `npm run lint` | ESLint |
| `npm run build && npx tsc --noEmit && npm test` | Full quality check — run before committing |

## Branching

**The default branch is `dev`, NOT `main`.**

- Base all branches off `dev`
- Open all PRs targeting `dev`
- `main` is the release branch — only release PRs merge into `main`
- Branch naming: `squad/{issue-number}-{kebab-case-slug}`

## Architecture

```
src/
├── extension.ts              → activation, WebviewViewProvider, status bar, message handling
├── copilotService.ts         → CopilotClient lifecycle, BYOK session creation
├── configuration.ts          → VS Code settings, validation
├── auth/credentialProvider.ts → auth abstraction (Entra ID / API Key)
├── types.ts                  → SDK type definitions, structural interfaces
media/
├── chat.js                   → webview UI logic
└── chat.css                  → webview styles
```

One `CopilotClient` per extension lifetime. Sessions keyed by conversation ID and reused for multi-turn.

## TypeScript Conventions

- **Strict mode** enabled — all code must pass `tsc --noEmit`
- Use `import type` for type-only imports
- Prefer `.js` extensions in import paths (ESM compatibility)
- Use `interface` for structural types, `type` for unions/aliases
- Auth method type: `"entraId" | "apiKey"` (not loose `string`)

## Testing

- **Framework:** vitest
- **Mocks:** `src/test/__mocks__/` (`vscode.ts`, `copilot-sdk.ts`)
- **Test helpers:** `src/test/webview-test-helpers.ts`
- `createCredentialProvider` is **async** — always `await` it
- When asserting streaming message order, filter out infrastructure messages: `authStatus`, `modelsUpdated`, `modelSelected`, `configStatus`, `cliStatus`, `workspaceInfo`, `processingPhaseUpdate`
- When adding new VS Code APIs to `activate()`, add corresponding mocks to `src/test/__mocks__/vscode.ts`

## Error Handling

- Wrap all credential and SDK calls in try-catch
- Error messages must be **actionable** — tell the user what to do, not just what went wrong
- Rewrite SDK auth errors to point at the settings gear
- Always call `client.stop()` in `finally` blocks
- Functions documented as "never throws" must catch ALL async operations
- Use `.catch(() => {})` only for fire-and-forget status updates, never for critical paths

## Security

- **No secrets in source code** — API keys only via VS Code `SecretStorage`
- **Air-gap compliance** — no external network calls except to the configured Azure AI Foundry endpoint
- **CSP in webview HTML** — all webview HTML must include a Content Security Policy
- **No eval, no inline scripts** in webview content

## Copilot SDK Patterns

- Use the **named event** pattern: `session.on("assistant.message_delta", handler)` — do NOT use the catch-all `.on(callback)` pattern
- `session.send({ prompt })` for streaming — NOT `session.sendMessage()`
- `bearerToken` accepts only a static string — no refresh callback
- `type: "azure"` auto-appends `/openai/v1/` — `baseUrl` should NOT include that path
- `onPermissionRequest` defaults to SDK `approveAll` when callers omit a handler
