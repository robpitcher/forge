# Decision: Conversation History UI Architecture

**Date:** 2026-03-01  
**Decided by:** Blair (Extension Dev)  
**Context:** Issue #87 — Conversation history persistence and resume

## Decision

Conversation history UI implemented as an **overlay panel** with in-memory message caching via VS Code `workspaceState`.

### Architecture Choices

1. **Message Cache Storage**: `workspaceState` (VS Code's key-value API)
   - Key: `forge.messages.{sessionId}`
   - Value: `Array<{role: 'user' | 'assistant', content: string}>`
   - **Rationale**: Simpler than SDK session metadata. workspaceState persists across VS Code sessions. No need for filesystem I/O or complex serialization.

2. **Conversation List UI**: Absolute-positioned overlay (`z-index: 1000`)
   - **Rationale**: Non-intrusive. Dismissible. No viewport scroll conflicts with #chatMessages. Can be toggled without rebuilding DOM.

3. **Message Accumulation**: `_conversationMessages` array in `ChatViewProvider`
   - Updated in-memory during session: push user message before send, push assistant message in `session.idle` handler
   - Cached to workspaceState after each successful `streamEnd`
   - **Rationale**: Single source of truth for current conversation. Avoids reading DOM to reconstruct state.

4. **Resume Behavior**: Clear chat DOM, replay cached messages
   - Calls `resumeConversation()` from copilotService (Childs owns SDK interaction)
   - Reads cached messages from workspaceState
   - Iterates cached messages array, calls `appendMessage(role, content)` to render
   - **Rationale**: Clean slate prevents mixed old/new messages. Replay ensures UI matches cache. No need for message IDs or timestamps in cache.

5. **Last Session Tracking**: `forge.lastSessionId` in workspaceState
   - Updated after each successful session creation
   - Can be used in future for "Resume last session on activate" feature
   - **Rationale**: Enables default-resume behavior without listing all sessions on startup.

### Message Contract

| Direction | Type | Payload |
|-----------|------|---------|
| ext → webview | `conversationList` | `{ conversations: ConversationMetadata[] }` |
| ext → webview | `conversationResumed` | `{ sessionId, messages: {role, content}[] }` |
| webview → ext | `listConversations` | `{}` |
| webview → ext | `resumeConversation` | `{ sessionId }` |
| webview → ext | `deleteConversation` | `{ sessionId }` |

### CSS Patterns

- `.conversation-list.hidden` → `display: none` (no JS visibility logic)
- `.conversation-item:hover` → `--vscode-list-hoverBackground` (native VS Code hover style)
- `.conversation-delete-btn:hover` → `color: var(--vscode-errorForeground)` (delete affordance)

### Relative Time Display

Used `relativeTime(date)` helper with bucketing:
- < 1 min: "just now"
- < 60 min: "Xm ago"
- < 24 hrs: "Xh ago"
- 1 day: "yesterday"
- > 1 day: "Xd ago"

**Rationale**: Human-readable, compact, consistent with common chat UX patterns.

## Alternatives Considered

1. **Filesystem-based cache** — rejected: unnecessary I/O overhead, no benefit over workspaceState
2. **SDK session metadata** — rejected: not designed for arbitrary UI data, would require custom JSON field
3. **Modal dialog for history** — rejected: intrusive, hides chat context while browsing history
4. **Sidebar tree view** — rejected: separate pane overkill for MVP, harder to implement

## Impact

- No breaking changes to backend (copilotService, configuration, types)
- Webview state management simplified (no DOM parsing for message history)
- Extension activation unchanged (no automatic resume in MVP — can add later)
- 3 new message types, 105 LoC in extension.ts, 85 LoC in chat.js, 50 LoC in chat.css

## Follow-up

- Childs: Implement `listConversations()`, `resumeConversation()`, `deleteConversation()` in copilotService.ts
- Windows: Add tests for message caching, resume flow, delete flow (conversation-history.test.ts already exists)
- Future: Auto-resume last session on activate (use `forge.lastSessionId`)
- Future: Generate conversation summary from first user message (for better list display)
