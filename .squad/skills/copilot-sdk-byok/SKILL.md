---
name: "copilot-sdk-byok"
description: "Copilot SDK BYOK (Bring Your Own Key) integration patterns for Azure AI Foundry"
domain: "sdk-integration"
confidence: "high"
source: "manual — extracted from github/copilot-sdk docs/auth/byok.md and docs/guides/setup/byok.md"
---

## Context

Enclave uses the Copilot SDK in BYOK mode to route all model inference to a private Azure AI Foundry endpoint. This skill covers the BYOK provider configuration, session lifecycle, and known limitations. Read this before any work on `src/copilotService.ts` or session management.

**Source docs:** https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md and https://github.com/github/copilot-sdk/blob/main/docs/guides/setup/byok.md

## Patterns

### Provider Configuration for Azure AI Foundry

For Azure AI Foundry with OpenAI-compatible endpoint path (`/openai/v1/`), use `type: "openai"`:

```typescript
const session = await client.createSession({
    model: "gpt-4.1",  // Required with BYOK — SDK throws if missing
    provider: {
        type: "openai",       // Use "openai" for /openai/v1/ path
        baseUrl: "https://your-resource.openai.azure.com/openai/v1/",
        apiKey: process.env.FOUNDRY_API_KEY,
        wireApi: "responses", // Use "responses" for GPT-5 series, "completions" for older models
    },
    streaming: true,
    availableTools: [],  // Disable tools for MVP
});
```

### Provider Type Selection

| Endpoint Type | `type` Value | `baseUrl` Format |
|---------------|-------------|------------------|
| Azure AI Foundry (OpenAI-compatible path) | `"openai"` | `https://resource.openai.azure.com/openai/v1/` |
| Azure OpenAI (native) | `"azure"` | `https://resource.openai.azure.com` (no path — SDK constructs it) |
| OpenAI direct | `"openai"` | `https://api.openai.com/v1` |
| Anthropic | `"anthropic"` | `https://api.anthropic.com` |
| Ollama (local) | `"openai"` | `http://localhost:11434/v1` |

**⚠️ Critical:** For `type: "azure"`, the `baseUrl` must be JUST the host — no `/openai/v1` path. The SDK adds the path automatically. For `type: "openai"` with Azure AI Foundry, include the full path.

### wireApi Parameter

- `"completions"` — Default. For models using the Chat Completions API (GPT-4, GPT-4.1, older).
- `"responses"` — For newer models using the Responses API (GPT-5 series). Azure AI Foundry supports both.

Enclave's default is `"completions"` (set in `package.json` configuration schema).

### Session Lifecycle

```typescript
// Client — one per extension lifetime
const client = new CopilotClient({ cliPath: config.cliPath || undefined });
await client.start();

// Session — one per conversation, reusable for multi-turn
const session = await client.createSession({ model, provider, streaming, availableTools });

// Send message (streaming)
await session.send({ prompt: "user message" });

// Or send and wait for complete response
const response = await session.sendAndWait({ prompt: "user message" });

// Cleanup
await session.destroy();  // Per session
await client.stop();      // Per client
```

### Event Types for Streaming

| Event | When | Data |
|-------|------|------|
| `assistant.message_delta` | Each token chunk | `{ delta: { content: string } }` |
| `assistant.message` | Complete message | `{ content: string }` |
| `session.idle` | Response complete | — |
| `session.error` | Error occurred | `{ error: { message: string } }` |
| `assistant.usage` | Token usage report | `{ inputTokens, outputTokens }` |

### Session Resume with BYOK

When resuming BYOK sessions, provider config MUST be re-provided (keys are never persisted):

```typescript
const resumed = await client.resumeSession("session-id", {
    provider: { type: "openai", baseUrl, apiKey },
});
```

### CopilotClient Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cliPath` | `string` | `"copilot"` from PATH | Path to CLI binary |
| `cliUrl` | `string` | — | URL of external CLI server (skips spawning) |
| `port` | `number` | `0` (random) | Server port |
| `useStdio` | `boolean` | `true` | Use stdio transport |
| `autoStart` | `boolean` | `true` | Auto-start on first call |
| `autoRestart` | `boolean` | `true` | Auto-restart on crash |

### Session Config Options

| Option | Type | Required (BYOK) | Description |
|--------|------|------------------|-------------|
| `model` | `string` | **Yes** | Model deployment name |
| `provider` | `ProviderConfig` | **Yes** | BYOK provider config |
| `streaming` | `boolean` | No | Enable streaming (default varies) |
| `availableTools` | `Tool[]` | No | Tools to expose (`[]` disables all) |
| `systemMessage` | `SystemMessageConfig` | No | Custom system prompt |
| `infiniteSessions` | config | No | Auto context compaction |

## BYOK Limitations

| Limitation | Impact on Enclave |
|------------|-------------------|
| **Static credentials only** | No Entra ID, OIDC, managed identity. Must use API key or static bearer token. |
| **No auto-refresh** | Bearer tokens expire; must create new session with fresh token. For MVP, API key only. |
| **Keys not persisted** | Must re-provide on session resume. Enclave creates fresh sessions per conversation. |
| **No Entra ID** | Documented as NG8 in PRD — deferred to post-MVP. |

## Anti-Patterns

- **Using `type: "azure"` with a `/openai/v1/` path** — the SDK double-constructs the path. Use `type: "openai"` if the endpoint includes `/openai/v1/`.
- **Omitting `model` with BYOK** — SDK throws an error. Always required with custom provider.
- **Storing API keys in plain text in committed files** — use environment variables or VS Code SecretStorage.
- **Using `sendAndWait` for streaming UX** — use `send()` + `assistant.message_delta` events for token-by-token rendering.
- **Calling `client.stop()` without `session.destroy()`** — always clean up sessions first.
