### Mode Selector Architecture (#108)
**By:** Blair
**Date:** 2025-07-25
**What:**

Mode selector uses three modes — Chat (read-only), Agent (default, full tools), Plan (agent + planning system prompt).

Key decisions:
1. **Mode applies to next new conversation** — no session destruction on mode switch. Simplest approach; avoids disrupting in-flight responses.
2. **Chat mode hard-excludes `shell`, `write`, `url`, `mcp`** regardless of per-tool settings, but respects `toolRead` setting. This ensures Chat mode is truly read-only.
3. **Plan mode prepends system message** — merged with user's custom `systemMessage` using double newline separator. Plan prefix always comes first.
4. **Mode persisted in `workspaceState`** (not settings.json) — it's UI state, not configuration. Uses key `forge.chatMode` with `"agent"` default.
5. **`buildToolConfig` is now exported** — needed by tests and potentially other consumers. `ChatMode` type is also exported from `copilotService.ts`.
