# Decision: Workspace Context Prompt Format

**Author:** Childs (SDK Dev)
**Date:** 2026-02-28
**Issue:** #26 — Add @workspace context
**Status:** Implemented

## Context

When users attach workspace context (file snippets or selections) to a chat message, we need a consistent format for injecting that context into the prompt sent to the Copilot SDK session.

## Decision

Each context item is formatted as a fenced code block with a descriptive header:

```
--- Context: src/utils.ts:12-28 (typescript) ---
```typescript
{code here}
```

--- Context: src/config.ts (typescript) ---
```typescript
{more code}
```

{user's actual prompt here}
```

### Rules

1. **Selections** include line range in the header: `{filePath}:{startLine}-{endLine} ({languageId})`
2. **Files** omit line range: `{filePath} ({languageId})`
3. **Truncation budget:** 8000 characters total for all context blocks (user prompt excluded from budget)
4. If budget is exceeded, the **last** context item's content is truncated and a `...[truncated — context exceeds 8000 char limit]` note is appended
5. Items beyond the truncated one are dropped entirely
6. User prompt is always appended after a blank line, unmodified

### Rationale

- Fenced code blocks with language tags give the LLM clear syntax-highlighted context
- Header lines with file path and line range let the model reason about source location
- 8000-char budget prevents overwhelming the model's context window while leaving room for conversation history
- Truncating the last item (rather than dropping it entirely) preserves partial information
