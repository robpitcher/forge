### 2026-03-03T17:03Z: User directive — CLI distribution strategy
**By:** Rob Pitcher (via Copilot)
**What:** Do NOT bundle @github/copilot CLI in the vsix. Instead: (1) Require user-installed CLI, (2) Provide forge.copilot.cliPath setting, (3) Auto-discover via PATH as fallback, (4) Run preflight validation at activation and give fix-it UX when CLI is missing or wrong.
**Why:** Bundling 103MB of multi-platform native binaries is not best practice. The CLI should be a prerequisite, not embedded.
