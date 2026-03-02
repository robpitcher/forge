### Mode changes destroy and recreate sessions silently
**By:** Blair
**When:** 2025-07-25
**What:** When the user switches chat mode (Chat/Agent/Plan), the extension destroys the current session and resets conversation state without a confirmation dialog. This is necessary because `buildToolConfig` and `buildSystemMessage` bake the mode into the session at creation time — the session reuse map means a mode change without destruction would be silently ignored. Mode changes are treated as lighter than model changes (which do prompt for confirmation) because they don't invalidate prior conversation context in the same way.
**Affects:** `src/extension.ts` `_handleMessage` handler for `modeChanged`.
