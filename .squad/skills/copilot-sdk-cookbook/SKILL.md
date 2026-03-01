---
name: "copilot-sdk-cookbook"
description: "Official Copilot SDK Node.js/TypeScript cookbook — code snippets and patterns from github/awesome-copilot"
domain: "sdk-integration"
confidence: "high"
source: "https://github.com/github/awesome-copilot/tree/main/cookbook/copilot-sdk/nodejs (commit 4488150)"
---

## Context

The official Copilot SDK cookbook from `github/awesome-copilot` contains practical, copy-pasteable recipes for common SDK patterns. This skill indexes all recipes so agents can quickly find the right snippet. The source repo has runnable `.ts` examples in the `recipe/` subfolder.

**Source:** https://github.com/github/awesome-copilot/tree/main/cookbook/copilot-sdk/nodejs

## Recipe Index

| Recipe | What It Covers | Key APIs | When to Use |
|--------|---------------|----------|-------------|
| [Error Handling](#error-handling) | try-catch, timeouts, abort, graceful shutdown | `client.stop()`, `session.abort()`, `session.sendAndWait(prompt, timeout)` | Any error handling or cleanup work |
| [Multiple Sessions](#multiple-sessions) | Parallel conversations, custom session IDs | `client.createSession()`, `client.listSessions()`, `client.deleteSession()` | Multi-user or multi-task patterns |
| [Persisting Sessions](#persisting-sessions) | Save/resume across restarts | `client.resumeSession()`, `session.getMessages()` | Session persistence features |
| [Managing Local Files](#managing-local-files) | AI-powered file organization | `session.sendAndWait()`, event handlers | Tool-using agentic patterns |
| [Accessibility Report](#accessibility-report) | MCP server integration, streaming, Playwright | `mcpServers` config, `session.on()`, streaming events | MCP integration, streaming output |
| [PR Visualization](#pr-visualization) | GitHub MCP, interactive CLI, charts | `systemMessage`, GitHub MCP tools | GitHub data analysis patterns |
| [Ralph Loop](#ralph-loop) | Autonomous task loops, fresh context per iteration | `client.createSession()` in a loop, `onPermissionRequest` | Autonomous development workflows |

---

## Error Handling

### Basic try-catch with cleanup

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
try {
    await client.start();
    const session = await client.createSession({ model: "gpt-5" });
    const response = await session.sendAndWait({ prompt: "Hello!" });
    console.log(response?.data.content);
    await session.destroy();
} catch (error) {
    console.error("Error:", error.message);
} finally {
    await client.stop();
}
```

### Specific error types

```typescript
try {
    await client.start();
} catch (error) {
    if (error.message.includes("ENOENT")) {
        console.error("Copilot CLI not found. Please install it first.");
    } else if (error.message.includes("ECONNREFUSED")) {
        console.error("Could not connect to Copilot CLI server.");
    } else {
        console.error("Unexpected error:", error.message);
    }
}
```

### Timeout handling

```typescript
const response = await session.sendAndWait(
    { prompt: "Complex question..." },
    30000 // 30 second timeout in milliseconds
);
```

### Aborting a request

```typescript
session.send({ prompt: "Write a very long story..." });
setTimeout(async () => {
    await session.abort();
}, 5000);
```

### Graceful shutdown (SIGINT)

```typescript
process.on("SIGINT", async () => {
    const errors = await client.stop();
    if (errors.length > 0) {
        console.error("Cleanup errors:", errors);
    }
    process.exit(0);
});
```

### Force stop with timeout race

```typescript
const stopPromise = client.stop();
const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 5000)
);
try {
    await Promise.race([stopPromise, timeout]);
} catch {
    await client.forceStop();
}
```

**Best practices:** Always use try-finally for `client.stop()`. Handle ENOENT (CLI not installed). Set timeouts on long-running requests.

---

## Multiple Sessions

### Creating parallel sessions

```typescript
const session1 = await client.createSession({ model: "gpt-5" });
const session2 = await client.createSession({ model: "gpt-5" });
const session3 = await client.createSession({ model: "claude-sonnet-4.5" });

// Each session maintains its own conversation history
await session1.sendAndWait({ prompt: "You are helping with a Python project" });
await session2.sendAndWait({ prompt: "You are helping with a TypeScript project" });
```

### Custom session IDs

```typescript
const session = await client.createSession({
    sessionId: "user-123-chat",
    model: "gpt-5",
});
console.log(session.sessionId); // "user-123-chat"
```

### Listing and deleting sessions

```typescript
const sessions = await client.listSessions();
await client.deleteSession("user-123-chat");
```

---

## Persisting Sessions

### Creating a session with a stable ID

```typescript
const session = await client.createSession({
    sessionId: "user-123-conversation",
    model: "gpt-5",
});
await session.sendAndWait({ prompt: "Let's discuss TypeScript generics" });
await session.destroy(); // Destroy but keep data on disk
```

### Resuming a session

```typescript
const session = await client.resumeSession("user-123-conversation");
// Previous context is restored
await session.sendAndWait({ prompt: "What were we discussing?" });
```

### Getting session history

```typescript
const messages = await session.getMessages();
for (const msg of messages) {
    console.log(`[${msg.type}]`, msg.data);
}
```

---

## MCP Server Integration

### Configuring MCP servers in createSession

```typescript
const session = await client.createSession({
    model: "claude-opus-4.6",
    streaming: true,
    mcpServers: {
        playwright: {
            type: "local",
            command: "npx",
            args: ["@playwright/mcp@latest"],
            tools: ["*"],
        },
    },
});
```

This gives the model access to tools like `browser_navigate`, `browser_snapshot`, `browser_click`.

### System messages for repo context

```typescript
const session = await client.createSession({
    model: "gpt-5",
    systemMessage: {
        content: `
<context>
You are analyzing pull requests for: ${owner}/${repoName}
The current working directory is: ${process.cwd()}
</context>
<instructions>
- Use the GitHub MCP Server tools to fetch PR data
- Save any generated images to the current working directory
</instructions>
`,
    },
});
```

---

## Streaming Events

### Event handler pattern

```typescript
session.on((event) => {
    switch (event.type) {
        case "assistant.message":
            console.log(`\nCopilot: ${event.data.content}`);
            break;
        case "assistant.message.delta":
            process.stdout.write(event.data.deltaContent ?? "");
            break;
        case "tool.execution_start":
            console.log(`  → Running: ${event.data.toolName} ${event.data.toolCallId}`);
            break;
        case "tool.execution_complete":
            console.log(`  ✓ Completed: ${event.data.toolCallId}`);
            break;
        case "session.idle":
            // Session finished processing
            break;
        case "session.error":
            console.error(`\nError: ${event.data.message}`);
            break;
    }
});
```

### Wait-for-idle pattern (streaming with send)

```typescript
let idleResolve: (() => void) | null = null;

session.on((event) => {
    if (event.type === "assistant.message.delta") {
        process.stdout.write(event.data.deltaContent ?? "");
    } else if (event.type === "session.idle") {
        idleResolve?.();
    }
});

const waitForIdle = (): Promise<void> =>
    new Promise((resolve) => { idleResolve = resolve; });

let idle = waitForIdle();
await session.send({ prompt });
await idle;
```

---

## Ralph Loop (Autonomous Task Loop)

### Core concept

State lives on disk, not in the model's context. Each iteration starts fresh, reads state from files, does one task, writes results back, and exits.

### Simple version

```typescript
import { readFile } from "fs/promises";
import { CopilotClient } from "@github/copilot-sdk";

async function ralphLoop(promptFile: string, maxIterations: number = 50) {
    const client = new CopilotClient();
    await client.start();
    try {
        const prompt = await readFile(promptFile, "utf-8");
        for (let i = 1; i <= maxIterations; i++) {
            // Fresh session each iteration — context isolation is the point
            const session = await client.createSession({ model: "gpt-5.1-codex-mini" });
            try {
                await session.sendAndWait({ prompt }, 600_000); // 10 min timeout
            } finally {
                await session.destroy();
            }
        }
    } finally {
        await client.stop();
    }
}
```

### Full version with auto-approve and working directory

```typescript
const session = await client.createSession({
    model: "gpt-5.1-codex-mini",
    workingDirectory: process.cwd(),
    onPermissionRequest: async () => ({ allow: true }),
});

session.on((event) => {
    if (event.type === "tool.execution_start") {
        console.log(`  ⚙ ${event.data.toolName}`);
    }
});

await session.sendAndWait({ prompt }, 600_000);
```

### Required file structure for Ralph loops

```
project-root/
├── PROMPT_plan.md              # Planning mode instructions
├── PROMPT_build.md             # Building mode instructions
├── AGENTS.md                   # Build/test commands (~60 lines max)
├── IMPLEMENTATION_PLAN.md      # Task list (generated by planning mode)
├── specs/                      # Requirement specs
└── src/                        # Source code
```

**Key insight:** `IMPLEMENTATION_PLAN.md` is the shared state between isolated sessions. Planning mode generates it, building mode consumes and updates it.

---

## Forge-Specific Notes

Our extension (`forge`) uses the SDK differently from these cookbook examples:
- We use **BYOK mode** with `provider` config (see `copilot-sdk-byok` skill)
- Our events use the `.on(eventName, handler)` pattern returning unsubscribe functions (not the `.on(callback)` catch-all pattern shown in newer cookbook examples)
- We manage sessions via `getOrCreateSession()` in `src/copilotService.ts`
- Bearer token auth for Entra ID is set via `provider.bearerToken` (static string, no refresh callback)

When adapting cookbook patterns for Forge, check the SDK version compatibility in our `package.json` (`@github/copilot-sdk: 0.1.26`).

## Anti-Patterns

1. **Don't accumulate context** across Ralph loop iterations — fresh session each time
2. **Don't skip `client.stop()`** — always use try-finally
3. **Don't hardcode timeouts** without considering the task complexity
4. **Don't assume session IDs are unique** across different clients — use meaningful prefixes
