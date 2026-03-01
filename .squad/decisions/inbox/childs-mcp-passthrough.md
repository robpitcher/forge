# Decision: MCP server config — local-only, tools wildcard

**Author:** Childs  
**Date:** 2026-03-01  
**Issue:** #90  

## Context

Issue #90 adds MCP server support. The SDK's `MCPServerConfig` union includes both `MCPLocalServerConfig` (stdio) and `MCPRemoteServerConfig` (HTTP/SSE). We need to decide which transport types to allow and what tool filtering to apply.

## Decision

1. **Local-only transport** — `buildMcpServersConfig()` always sets `type: "local"`. Remote MCP servers (`"http"`, `"sse"`) are not supported. Air-gap environments cannot reach external HTTP endpoints, so this constraint is inherent to our deployment model.

2. **Wildcard tool access** — Each MCP server gets `tools: ["*"]` (allow all tools from that server). Per-server tool filtering can be added later if users need it. The existing `excludedTools: ["mcp"]` setting already provides a global kill switch.

3. **Typed return** — `buildMcpServersConfig` returns `Record<string, MCPLocalServerConfig>` (not `Record<string, unknown>`) so the SDK's `SessionConfig.mcpServers` type checks pass without casts. `MCPLocalServerConfig` is re-exported from `types.ts`.

## Consequences

- Users can only configure stdio-based MCP servers (command + args + env).
- If remote MCP support is ever needed, `buildMcpServersConfig` will need to be extended and the air-gap policy reconsidered.
- Tool filtering per-server would require extending `McpServerConfig` in `types.ts` with a `tools` field.
