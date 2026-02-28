# SDK Tool Event API — Actual Shape

**Author:** Childs (SDK Dev)
**Date:** 2026-02-27
**Context:** Issue #25 — Enable Copilot CLI built-in tools

## Finding

The @github/copilot-sdk (v0.1.26) does NOT use a "tool confirmation event" pattern for approvals. The actual API:

### Permission Handling
- **`onPermissionRequest`** callback in `SessionConfig` — called when the CLI needs permission for shell, write, read, MCP, or URL operations.
- Input: `PermissionRequest { kind: "shell"|"write"|"mcp"|"read"|"url", toolCallId?: string, [key: string]: unknown }`
- Output: `PermissionRequestResult { kind: "approved"|"denied-by-rules"|"denied-no-approval-rule-and-could-not-request-from-user"|"denied-interactively-by-user" }`
- The SDK also exports `approveAll` as a convenience handler.

### Tool Execution Events (session events, subscribe via `session.on()`)
- `tool.execution_start` — `{ toolCallId, toolName, arguments?, mcpServerName?, parentToolCallId? }`
- `tool.execution_complete` — `{ toolCallId, success, result?: { content }, error?: { message }, parentToolCallId? }`
- `tool.execution_partial_result` — streaming partial output
- `tool.execution_progress` — progress messages
- `tool.user_requested` — when user explicitly requests a tool

### Adapted Message Protocol
The `toolConfirmation` message uses `request.kind` (e.g., "shell", "write") as the `tool` field, since the permission request fires before `tool.execution_start` and has no `toolName`. The `params` field contains the full `PermissionRequest` object for the webview to display relevant details.

The `toolResult` message uses `toolName` from `tool.execution_start`, tracked via a `toolCallId → toolName` map.

### Enabling Tools
Removing `availableTools: []` from `createSession()` exposes the CLI's default built-in tools. No explicit tool list needed.

## Decision
Implemented using `onPermissionRequest` for approval flow and session events for execution notifications. This matches the SDK's actual architecture rather than the assumed event-based confirmation pattern.
