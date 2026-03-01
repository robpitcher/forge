# Decision: Session Management API Design

**Date:** 2026-03-01  
**Author:** Childs  
**Issue:** #87 (Conversation history persistence and resume)

## Context

The Copilot SDK (v0.1.26) provides built-in session management APIs: `listSessions()`, `resumeSession()`, `getLastSessionId()`, and `deleteSession()`. These allow persisting conversation history to disk and resuming conversations across extension restarts.

## Decision

Implemented wrapper functions in `src/copilotService.ts` that expose these SDK capabilities:

1. **`listConversations()`** — Maps SDK's `SessionMetadata` to our simpler `ConversationMetadata` interface for UI display (sessionId, summary, startTime, modifiedTime).

2. **`resumeConversation(sessionId, config, authToken, onPermissionRequest)`** — Wraps `client.resumeSession()` and applies the same provider + tool configuration as `getOrCreateSession()` to maintain consistency. Stores resumed session in the local sessions map so it can be managed alongside new sessions.

3. **`getLastConversationId()`** — Direct wrapper for SDK's `getLastSessionId()`, useful for "continue last conversation" UX.

4. **`deleteConversation(sessionId)`** — Wraps SDK's `deleteSession()` and also removes from local sessions map.

5. **DRY refactor** — Extracted provider and tool config construction into `buildProviderConfig()` and `buildToolConfig()` helper functions. Both `getOrCreateSession()` and `resumeConversation()` use these helpers to ensure identical config behavior.

## Rationale

- **Consistency:** Provider config (BYOK, Entra ID/API key auth), tool exclusions, and systemMessage must match between new and resumed sessions to avoid user confusion.
- **Error handling:** All wrappers catch and rethrow with actionable error messages following project conventions.
- **Type safety:** Re-exported SDK types (`SessionMetadata`, `SessionListFilter`, `ResumeSessionConfig`) as type-only imports to maintain strict TypeScript mode compliance.
- **Separation of concerns:** SDK integration stays in copilotService.ts; UI layer (Blair) will consume these wrappers for conversation list/resume UX.

## Impact

- Blair can implement conversation history UI (#87) using these wrappers without touching SDK directly.
- Windows will write tests for the new functions following existing patterns.
- No breaking changes to existing `getOrCreateSession()` behavior.
