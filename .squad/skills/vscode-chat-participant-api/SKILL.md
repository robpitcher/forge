---
name: "vscode-chat-participant-api"
description: "VS Code Chat Participant API patterns for building chat extensions"
domain: "vscode-extension"
confidence: "high"
source: "manual — extracted from https://code.visualstudio.com/api/extension-guides/chat"
---

## Context

Enclave registers a VS Code Chat Participant (`enclave.copilot`) to provide a native Copilot Chat experience. This skill covers the Chat Participant API registration, request handling, streaming responses, and UX patterns. Read this before any work on `src/extension.ts` or `package.json` chat configuration.

**Source docs:** https://code.visualstudio.com/api/extension-guides/chat

## Patterns

### Chat Participant Registration (package.json)

```json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "enclave.copilot",
        "fullName": "Enclave",
        "name": "copilot",
        "description": "AI-powered chat assistant for air-gapped environments",
        "isSticky": true
      }
    ]
  }
}
```

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier. Used in `createChatParticipant()`. |
| `name` | `string` | Short name for @-mentions. Use lowercase. |
| `fullName` | `string` | Display name in response title area. Use title case. |
| `description` | `string` | Placeholder text in chat input field. |
| `isSticky` | `boolean` | If `true`, participant persists as default in chat input after responding. |

**Reserved names:** Some participant names are reserved by VS Code. If a reserved name is used, VS Code shows the fully qualified name including the extension ID.

### Activation Event

```json
{
  "activationEvents": ["onChatParticipant:enclave.copilot"]
}
```

This provides lazy activation — the extension only loads when the user first interacts with the chat participant. This is important for NFR2 (activation time < 2s).

### Request Handler Signature

```typescript
const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> => {
    // Handle the chat request
};
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `request` | `ChatRequest` | User's prompt text, command, location, model reference |
| `context` | `ChatContext` | Chat history for this conversation (only messages mentioning this participant) |
| `stream` | `ChatResponseStream` | Response output stream — write markdown, code, buttons here |
| `token` | `CancellationToken` | Fires when user cancels. Wire to `session.abort()`. |

### Creating the Participant

```typescript
export function activate(context: vscode.ExtensionContext): void {
    const participant = vscode.chat.createChatParticipant(
        "enclave.copilot",    // Must match id in package.json
        handleChatRequest     // Request handler function
    );
    participant.iconPath = new vscode.ThemeIcon("hubot");
    context.subscriptions.push(participant);
}
```

### ChatResponseStream Output Types

| Method | Description | Example |
|--------|-------------|---------|
| `stream.markdown(text)` | Render markdown text (CommonMark) | `stream.markdown("**Hello!**\n")` |
| `stream.progress(text)` | Show progress message | `stream.progress("Thinking...")` |
| `stream.button(opts)` | Add interactive button | `stream.button({ command, title, arguments })` |
| `stream.reference(uri)` | Link to a file/resource | `stream.reference(vscode.Uri.file(path))` |
| `stream.anchor(uri, title)` | Inline clickable link | `stream.anchor(uri, "See docs")` |
| `stream.filetree(tree, base)` | Render file tree | `stream.filetree([...], baseUri)` |

**Streaming pattern:** Call `stream.markdown()` repeatedly with incremental content. Each call appends to the response. This creates the token-by-token streaming effect.

```typescript
// Correct — incremental streaming
session.on("assistant.message_delta", (event) => {
    if (event?.delta?.content) {
        stream.markdown(event.delta.content);  // Append each chunk
    }
});
```

### Error Display Pattern

```typescript
// Actionable error with settings button
stream.markdown("⚠️ Please configure the Azure AI Foundry endpoint\n\n");
stream.button({
    command: "workbench.action.openSettings",
    arguments: ["enclave.copilot"],
    title: "Open Settings",
});
```

### Chat Message History

Participants can access conversation history via `context.history`. Only messages where this participant was mentioned are included.

```typescript
const previousMessages = context.history.filter(
    h => h instanceof vscode.ChatRequestTurn
);
```

**Important:** History is NOT automatically sent to the model. It's up to the participant to include history as context. In Enclave's case, the Copilot SDK session handles multi-turn context internally — we don't need to manually manage history.

### Conversation ID Derivation

VS Code's `ChatContext` may or may not have an `id` field. Enclave uses a defensive pattern:

```typescript
function getConversationId(context: vscode.ChatContext): string {
    const ctxWithId = context as unknown as { id?: unknown };
    if (typeof ctxWithId.id === "string" && ctxWithId.id.length > 0) {
        return ctxWithId.id;
    }
    return `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

**Note:** The `id` property is not guaranteed by the API docs. This fallback pattern generates a unique ID if not available, but breaks session reuse if the context changes between turns. Test with real VS Code 1.93+ to confirm behavior.

### Cancellation Handling

```typescript
const abortListener = token.onCancellationRequested(() => {
    try {
        session.abort();
    } catch {
        // Ignore abort errors
    }
});

try {
    await sendMessage(request.prompt, session, stream);
} finally {
    abortListener.dispose();
}
```

### Slash Commands (Post-MVP)

Slash commands provide shortcuts. Register in `package.json`:

```json
{
  "chatParticipants": [{
    "id": "enclave.copilot",
    "commands": [
      { "name": "explain", "description": "Explain the selected code" },
      { "name": "fix", "description": "Fix issues in the selected code" }
    ]
  }]
}
```

Access via `request.command` in the handler. Deferred to Phase 4 per PRD (NG6).

### Participant Detection (Post-MVP)

Auto-routing without @-mention. Uses `disambiguation` in `package.json`:

```json
{
  "disambiguation": [{
    "category": "enclave",
    "description": "AI coding assistant questions",
    "examples": ["Help me write a function", "Explain this error"]
  }]
}
```

### Follow-Up Questions (Post-MVP)

```typescript
participant.followupProvider = {
    provideFollowups(result, context, token) {
        return [{ prompt: "Tell me more", label: "More details" }];
    }
};
```

### VS Code Version Requirements

- **Minimum:** VS Code 1.93.0 (Chat Participant API GA)
- **Engine:** `"vscode": "^1.93.0"` in package.json
- **Node.js:** 20+ (per `@github/copilot-sdk` engines requirement)

### Extension Packaging

```bash
# Build
node esbuild.config.mjs

# Package as .vsix
npx vsce package

# Install sideloaded
code --install-extension enclave-x.y.z.vsix
```

The `@github/copilot-sdk` must be **bundled** (not externalized) in the esbuild output. The Copilot CLI binary is NOT bundled — must be pre-installed.

## Anti-Patterns

- **Using `vscode.window.showInformationMessage` for errors** — errors should appear in the chat stream via `stream.markdown()`, not as separate notifications.
- **Blocking activation** — use `onChatParticipant` activation event for lazy loading. Never use `*` activation.
- **Calling `stream.markdown()` after the handler returns** — all streaming must complete within the handler's Promise lifecycle.
- **Ignoring CancellationToken** — always wire to `session.abort()`. Users expect Ctrl+C to stop generation.
- **Manually managing chat history** — the Copilot SDK session handles multi-turn context. Don't duplicate it.
- **Using `request.model` for inference** — that's the VS Code Language Model API model. Enclave uses its own BYOK session, not the VS Code model.
