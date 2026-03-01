# Copilot Coding Agent — Repository Instructions

## Branching Strategy

**⚠️ CRITICAL: The default branch for all development work is `dev`, NOT `main`.**

- **Always base your branches off `dev`.**
- **Always open PRs targeting `dev`.**
- `main` is the release branch — only release PRs merge into `main`.
- If you need to create a branch, check out from `origin/dev` first.

## Squad Integration

You are working on a project that uses **Squad**, an AI team framework. When picking up issues autonomously, follow these guidelines.

### Team Context

Before starting work on any issue:

1. Read `.squad/team.md` for the team roster, member roles, and your capability profile.
2. Read `.squad/routing.md` for work routing rules.
3. If the issue has a `squad:{member}` label, read that member's charter at `.squad/agents/{member}/charter.md` to understand their domain expertise and coding style — work in their voice.

### Capability Self-Check

Before starting work, check your capability profile in `.squad/team.md` under the **Coding Agent → Capabilities** section.

- **🟢 Good fit** — proceed autonomously.
- **🟡 Needs review** — proceed, but note in the PR description that a squad member should review.
- **🔴 Not suitable** — do NOT start work. Instead, comment on the issue:
  ```
  🤖 This issue doesn't match my capability profile (reason: {why}). Suggesting reassignment to a squad member.
  ```

### Branch Naming

Use the squad branch convention, branching from `dev`:
```
squad/{issue-number}-{kebab-case-slug}
```
Example: `squad/42-fix-login-validation`

### PR Guidelines

When opening a PR:
- **Target branch: `dev`** (never `main`)
- Reference the issue: `Closes #{issue-number}`
- If the issue had a `squad:{member}` label, mention the member: `Working as {member} ({role})`
- If this is a 🟡 needs-review task, add to the PR description: `⚠️ This task was flagged as "needs review" — please have a squad member review before merging.`
- Follow any project conventions in `.squad/decisions.md`

### Decisions

If you make a decision that affects other team members, write it to:
```
.squad/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.

---

## Project Overview

**Forge** is a VS Code extension that provides AI chat for air-gapped environments via Azure AI Foundry. It uses the `@github/copilot-sdk` in BYOK (Bring Your Own Key) mode to route inference to a private endpoint — no GitHub auth, no internet.

**Stack:** TypeScript · VS Code Extension API · `@github/copilot-sdk` (v0.1.26) · esbuild · vitest

**Commands:** `npm run build` (esbuild bundle) · `npm test` (vitest run) · `npx tsc --noEmit` (typecheck)

---

## Architecture & File Ownership

```
VS Code Extension Host
  ├─ src/extension.ts           → activation, WebviewViewProvider, status bar, message handling
  ├─ src/copilotService.ts      → CopilotClient lifecycle, BYOK session creation
  ├─ src/configuration.ts       → VS Code settings, validation
  ├─ src/auth/credentialProvider.ts → auth abstraction (Entra ID / API Key)
  ├─ src/auth/authStatusProvider.ts → auth status probing (never throws)
  ├─ src/types.ts               → SDK type definitions, structural interfaces
  ├─ media/chat.js              → webview UI logic
  └─ media/chat.css             → webview styles
```

One `CopilotClient` per extension lifetime. Sessions keyed by conversation ID and reused for multi-turn.

---

## Copilot SDK Conventions

### BYOK Provider Config

```typescript
const session = await client.createSession({
    model: deploymentName,        // Required with BYOK — SDK throws if missing
    provider: {
        type: "openai",           // Use "openai" for Azure AI Foundry /openai/v1/ path
        baseUrl: endpoint,        // e.g. "https://resource.openai.azure.com/openai/v1/"
        apiKey: key,              // Static string — or use bearerToken for Entra ID
        wireApi: "completions",   // "completions" (default) or "responses" (GPT-5 series)
    },
    streaming: true,
    availableTools: [],           // Disabled for MVP
});
```

- `bearerToken` accepts only a **static string** — no refresh callback. For Entra ID, fetch token before session creation. (See #27)
- `type: "azure"` auto-appends `/openai/v1/` — don't use it if your `baseUrl` already includes that path.

### Session Lifecycle

```typescript
// Send (streaming) — use with event listeners
await session.send({ prompt });      // NOT session.sendMessage()

// Cleanup — always in finally blocks
await client.stop();
```

### Event Handling

Use the **named event** pattern. `.on(eventName, handler)` returns an unsubscribe function.

```typescript
const unsub = session.on("assistant.message_delta", (event) => {
    // event.data.delta.content — incremental token
});

// Cleanup
unsub();
```

**Do NOT use** the catch-all `.on(callback)` pattern from newer cookbook examples — our codebase uses the named-event pattern consistently.

### Key Events

| Event | Data | When |
|-------|------|------|
| `assistant.message_delta` | `delta.content` | Each token chunk |
| `assistant.message` | `content` | Complete response |
| `session.idle` | — | Response finished |
| `session.error` | `error.message` | Error occurred |

### Error Handling in SDK Calls

- Wrap all credential and SDK calls in try-catch
- Post **actionable** error messages to webview — tell the user what to do
- Rewrite SDK auth errors to point at the settings gear
- Always call `client.stop()` in `finally` blocks

---

## TypeScript Conventions

- **Strict mode** enabled in `tsconfig.json`
- Use `import type` for type-only imports
- Prefer `.js` extensions in import paths (ESM compatibility)
- Use `interface` for structural types, `type` for unions/aliases
- Auth method config: `"entraId" | "apiKey"` (default: `"entraId"`)
- API keys stored in VS Code `SecretStorage` — **never** in `settings.json`

---

## Testing Conventions

**Framework:** vitest · **Run:** `npm test`

### Mocks

Mocks live in `src/test/__mocks__/` (`vscode.ts`, `copilot-sdk.ts`).

```typescript
// Mock @azure/identity — use a CLASS, not a factory function
class MockDefaultAzureCredential {
    getToken = vi.fn().mockResolvedValue({ token: "mock-token", expiresOnTimestamp: Date.now() + 3600000 });
}

// Mock SecretStorage
const mockSecretStorage = {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
};
```

### Key Rules

- `createCredentialProvider` is **async** — always `await` it
- Webview test helpers in `src/test/webview-test-helpers.ts`
- Run full check: `npm run build && npx tsc --noEmit && npm test`

---

## VS Code Extension Conventions

### UI Architecture

- **WebviewViewProvider** — NOT Chat Participant API
- View in activitybar, ID: `forge.chatView`
- Enter to send, Shift+Enter for newline
- Status bar item for auth status

### Extension ↔ Webview Messages

**Extension → Webview:**

| Message Type | Purpose |
|-------------|---------|
| `streamStart` | New response beginning |
| `streamDelta` | Incremental token |
| `streamEnd` | Response complete |
| `error` | Error with actionable message |
| `authStatus` | Auth state update |
| `toolConfirmation` | Tool approval prompt |
| `toolResult` | Tool execution result |

**Webview → Extension:**

| Message Type | Purpose |
|-------------|---------|
| `sendMessage` | User prompt |
| `toolResponse` | Tool approval/rejection |

### Context Attachments

Selection and file attachments with **8000-char budget**. Context is prepended to the prompt string sent to `session.send()`.

---

## Error Handling Standards

1. **Functions documented as "never throws"** must catch ALL async operations — including `SecretStorage.get()`, credential calls, and status updates.
2. **Error messages must be actionable** — tell the user what to do, not just what went wrong. Example: "Authentication failed. Click ⚙️ to check your auth settings." not "Error: 401".
3. **Rewrite SDK auth errors** to point at the settings gear.
4. Use `.catch(() => {})` **only** for fire-and-forget status updates, never for critical paths.

---

## Security

- **No secrets in source code** — API keys only via `SecretStorage`
- **Air-gap compliance** — no external network calls except to the configured Azure AI Foundry endpoint
- **CSP in webview HTML** — all webview HTML must include a Content Security Policy
- **No eval, no inline scripts** in webview content
