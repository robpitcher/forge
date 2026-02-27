---
name: "copilot-sdk-nodejs-api"
description: "Node.js SDK API reference for @github/copilot-sdk — client, session, events, hooks"
domain: "sdk-integration"
confidence: "high"
source: "manual — extracted from github/copilot-sdk nodejs/README.md and docs/compatibility.md"
---

## Context

Enclave uses `@github/copilot-sdk` (v0.1.26) as the Node.js SDK for communicating with the Copilot CLI via JSON-RPC over stdio. This skill covers the full Node.js API surface. Read this before any work on `src/copilotService.ts` or when adding new SDK features.

**Source docs:** https://github.com/github/copilot-sdk/blob/main/nodejs/README.md

**SDK status:** Technical Preview — APIs may change. Wrap SDK calls in abstractions.

## Patterns

### Architecture

```
VS Code Extension Host (our code)
       ↓
  CopilotClient (@github/copilot-sdk)
       ↓ JSON-RPC over stdio (default) or TCP
  Copilot CLI (server mode, local process)
       ↓ HTTPS
  Azure AI Foundry (private endpoint)
```

The SDK manages CLI process lifecycle automatically — starts on `client.start()`, stops on `client.stop()`.

### CopilotClient API

```typescript
import { CopilotClient } from "@github/copilot-sdk";

// Constructor
const client = new CopilotClient({
    cliPath?: string,        // Path to copilot binary (default: "copilot" from PATH)
    cliArgs?: string[],      // Extra CLI arguments
    cliUrl?: string,         // Connect to external CLI server (skip spawning)
    port?: number,           // Server port (default: 0 = random)
    useStdio?: boolean,      // Use stdio transport (default: true)
    logLevel?: string,       // Log level (default: "info")
    autoStart?: boolean,     // Auto-start on first call (default: true)
    autoRestart?: boolean,   // Auto-restart on crash (default: true)
    githubToken?: string,    // GitHub token (not needed for BYOK)
    useLoggedInUser?: boolean, // Use stored credentials (default: true, false with BYOK)
});

// Lifecycle
await client.start();                    // Start CLI server
await client.stop();                     // Graceful stop (returns Error[])
await client.forceStop();                // Force stop

// Session management
const session = await client.createSession(config);
const resumed = await client.resumeSession(sessionId, config);
const sessions = await client.listSessions(filter?);
await client.deleteSession(sessionId);
const lastId = await client.getLastSessionId();

// Health
const pong = await client.ping("test");  // { message, timestamp }
const state = client.getState();          // ConnectionState

// Models
const models = await client.listModels(); // Available models with capabilities
```

### Session Creation Config

```typescript
const session = await client.createSession({
    // Identity
    sessionId?: string,           // Custom ID (auto-generated if omitted)

    // Model
    model?: string,               // Required for BYOK. e.g., "gpt-4.1"
    reasoningEffort?: "low" | "medium" | "high" | "xhigh",

    // Provider (BYOK)
    provider?: {
        type: "openai" | "azure" | "anthropic",
        baseUrl: string,
        apiKey?: string,
        bearerToken?: string,     // Alternative to apiKey
        wireApi?: "completions" | "responses",
        azure?: { apiVersion: string },
    },

    // Tools
    tools?: Tool[],               // Custom tools
    availableTools?: string[],    // Filter available tools ([] = none)
    excludedTools?: string[],     // Exclude specific tools

    // Streaming
    streaming?: boolean,

    // System prompt
    systemMessage?: {
        content: string,
        mode?: "append" | "replace",
    },

    // Session management
    infiniteSessions?: {
        enabled: boolean,
        backgroundCompactionThreshold?: number,  // 0.0-1.0
        bufferExhaustionThreshold?: number,       // 0.0-1.0
    },

    // Hooks
    hooks?: SessionHooks,

    // Permission handler
    onPermissionRequest?: PermissionHandler,

    // User input handler (enables ask_user tool)
    onUserInputRequest?: UserInputHandler,

    // MCP servers
    mcpServers?: Record<string, McpServerConfig>,

    // Custom agents
    customAgents?: AgentConfig[],
});
```

### Session Methods

```typescript
// Messaging
await session.send({ prompt: "message" });
const response = await session.sendAndWait({ prompt: "message" });
// response.data.content — the complete response text

// With attachments
await session.send({
    prompt: "Explain this",
    attachments: [{
        type: "uri",
        uri: "file:///path/to/file.ts",
    }],
});

// History
const messages = await session.getMessages();  // All session events

// Control
session.abort();                // Cancel in-flight request
await session.destroy();        // Clean up session
```

### Event System

```typescript
// Type-safe event handlers
session.on("assistant.message_delta", (event) => {
    // event.data.delta.content — incremental token
    console.log(event.data.delta.content);
});

session.on("assistant.message", (event) => {
    // event.data.content — complete response
});

session.on("session.idle", () => {
    // Response complete, session ready for next message
});

session.on("session.error", (event) => {
    // event.data.error.message — error description
});

session.on("assistant.usage", (event) => {
    // event.data.inputTokens, event.data.outputTokens
});

// One-time listener
session.once("session.idle", () => { ... });

// Remove listener
session.off("assistant.message_delta", handler);
// OR
session.removeListener("assistant.message_delta", handler);

// Catch-all
session.on((event) => {
    // All events
});
```

### Session Hooks

```typescript
const session = await client.createSession({
    hooks: {
        onPreToolUse: async (input, invocation) => ({
            permissionDecision: "allow",  // "allow" | "deny" | "ask"
            modifiedArgs: input.toolArgs,
            additionalContext: "Extra context",
        }),

        onPostToolUse: async (input, invocation) => ({
            additionalContext: "Post-execution notes",
        }),

        onUserPromptSubmitted: async (input, invocation) => ({
            modifiedPrompt: input.prompt,
        }),

        onSessionStart: async (input, invocation) => ({
            additionalContext: "Init context",
        }),

        onSessionEnd: async (input, invocation) => { },

        onErrorOccurred: async (input, invocation) => ({
            errorHandling: "retry",  // "retry" | "skip" | "abort"
        }),
    },
});
```

### Custom Tools

```typescript
const session = await client.createSession({
    tools: [{
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
            type: "object",
            properties: {
                city: { type: "string", description: "City name" },
            },
            required: ["city"],
        },
        handler: async (args) => {
            return { temperature: 72, condition: "sunny" };
        },
    }],
});
```

**Enclave MVP:** `availableTools: []` disables all tools including custom ones.

### Permission Handler

```typescript
import { approveAll } from "@github/copilot-sdk";

// Auto-approve all permissions
const session = await client.createSession({
    onPermissionRequest: approveAll,
});

// Custom handler
const session = await client.createSession({
    onPermissionRequest: async (request) => {
        if (request.type === "file_write") return "deny";
        return "allow";
    },
});
```

### External CLI Server Connection

For debugging or shared CLI processes:

```bash
copilot --headless --port 4321
```

```typescript
const client = new CopilotClient({
    cliUrl: "localhost:4321",  // Won't spawn CLI process
});
```

### SDK Features NOT Available (CLI-Only)

| Feature | CLI | SDK | Workaround |
|---------|-----|-----|------------|
| Session export | `--share` | ❌ | Collect events manually via `getMessages()` |
| Slash commands | `/help`, `/clear` | ❌ | TUI-only features |
| Login/logout | `copilot auth` | ❌ | Use env vars or BYOK |
| Color output | `--no-color` | ❌ | Terminal-specific |
| Diff mode | `/diff` | ❌ | Interactive UI only |
| Context compaction | `/compact` | Use `infiniteSessions` config |
| Permission shortcuts | `--yolo` | Use `onPermissionRequest: approveAll` |

### Error Handling Pattern

```typescript
try {
    const session = await client.createSession(config);
    await session.send({ prompt });
} catch (error) {
    if (error.message.includes("not found") || error.message.includes("ENOENT")) {
        // CLI not found — show user-friendly message
    } else if (error.message.includes("auth")) {
        // Authentication error
    } else {
        // Generic error
    }
}
```

### Infinite Sessions (Context Management)

For long conversations that might exceed context window:

```typescript
const session = await client.createSession({
    infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.80,  // Start compacting at 80%
        bufferExhaustionThreshold: 0.95,       // Block and compact at 95%
    },
});
```

**Enclave MVP:** Not implemented (NG4 — session persistence deferred).

## Anti-Patterns

- **Calling `client.stop()` without awaiting** — always `await client.stop()` to ensure graceful shutdown.
- **Using `sendAndWait` for streaming UX** — it blocks until complete. Use `send()` + event listeners for incremental rendering.
- **Not handling `session.error` events** — unhandled errors cause silent failures. Always listen for `session.error`.
- **Creating multiple CopilotClient instances** — one client manages the CLI process. Multiple clients spawn multiple CLI processes. Use one client, multiple sessions.
- **Assuming event listener methods** — SDK may use `off()` or `removeListener()`. Check with `typeof session.off === "function"` before calling.
- **Persisting API keys to disk** — BYOK keys are never stored by the SDK. Don't store them either. Use environment variables.
- **Ignoring `client.stop()` return value** — it returns `Error[]` of cleanup errors. Log them during development.
