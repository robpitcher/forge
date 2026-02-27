### 2026-02-27T23:09: User directive — auto-approve persistence
**By:** Rob Pitcher (via Copilot)
**What:** The `autoApproveTools` setting for issue #25 should use standard VS Code settings persistence (contributes.configuration in package.json, read via getConfiguration). Permanent until toggled off, scoped per VS Code's user/workspace model.
**Why:** User confirmed this is the easiest approach and the right UX — users already understand VS Code settings.
