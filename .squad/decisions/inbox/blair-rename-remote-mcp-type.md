# Decision: Rename RemoteMcpServerConfig → RemoteMcpSettings

**Date:** 2026-03-01
**Author:** Blair (Extension Dev)
**Context:** PR #106 review

## Decision

Our local type `RemoteMcpServerConfig` is renamed to `RemoteMcpSettings` to avoid confusion with the SDK's re-exported `MCPRemoteServerConfig`.

**Naming convention:** Our config types use `*Settings` suffix (`RemoteMcpSettings`), while SDK re-exports keep their original names (`MCPRemoteServerConfig`, `MCPLocalServerConfig`).

## Rationale

- `RemoteMcpServerConfig` (ours) vs `MCPRemoteServerConfig` (SDK) is too close — easy to import the wrong one.
- `RemoteMcpSettings` clearly signals "this is our VS Code settings shape" vs the SDK's wire format.

## Validation architecture

Ambiguous MCP server configs (`{command, url}`) are now rejected at the **validation layer** (`validateConfiguration()`), not silently handled at the mapper layer (`buildMcpServersConfig()`). Validation gives actionable error messages; mapper-layer skipping is silent and confusing.
