### Tool control precedence rule (#91)
**By:** Childs
**Date:** 2026-03-01
**What:** When both `availableTools` and `excludedTools` are configured, `availableTools` takes precedence — only it is passed to the SDK `SessionConfig`. A `console.warn` is emitted and `validateConfiguration()` returns a warning error. This is intentional: whitelisting is stricter than blacklisting, so it should win. Empty arrays are valid and passed through (empty `excludedTools` = "exclude nothing", empty `availableTools` = "no tools available").
