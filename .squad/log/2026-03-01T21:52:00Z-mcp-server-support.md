# Session Log: MCP Server Support

**Date:** 2026-03-01T21:52:00Z  
**Topic:** MCP Server Configuration (Issue #90)

## Summary

Three agents completed MCP server support in parallel:

- **Blair:** Added `McpServerConfig` type, extended `ExtensionConfig`, implemented config reading/validation in `configuration.ts`, added JSON schema to `package.json`
- **Childs:** Built `buildMcpServersConfig()` mapper, wired MCP config into `getOrCreateSession()` and `resumeConversation()`, re-exported SDK types
- **Windows:** Created `mcp-server-config.test.ts` with 13 tests covering reading, validation, and SDK passthrough

## Key Decisions

1. **Local-only transport** — MCP servers must use stdio (type: "local"). Remote HTTP/SSE not supported (air-gap constraint).
2. **Wildcard tools** — Each server gets `tools: ["*"]` by default. Global kill switch available via `excludedTools: ["mcp"]`.
3. **Simple config shape** — Users only configure `command`, `args`, `env`. SDK fields (`type`, `tools`, `timeout`) managed internally.

## Status

✅ All work complete. All tests pass. Ready for PR review and merge to `dev`.

## Next Steps

- Review PRs
- Merge to `dev`
- Plan UI work (conversation history, resume flows) for Blair
