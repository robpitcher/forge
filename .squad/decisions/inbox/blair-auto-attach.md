# Auto-attach editor selection on chat focus

**Date:** 2025-07-18
**Author:** Blair (Extension Dev)
**Status:** Implemented

## Decision

When the user has text selected in the editor and clicks into the Forge chat textarea, the extension automatically captures the selection and shows it as a context chip — no manual "📎 Selection" click needed.

## Approach

- **Webview → Extension message**: The textarea `focus` event sends `{ command: "chatFocused" }` to the extension, but only when no context chips are already showing (avoids spamming on repeated focus/blur).
- **Extension reads selection**: The `chatFocused` handler in `_handleMessage` reads `vscode.window.activeTextEditor` and posts `contextAttached` if there's a non-empty selection.
- **Dedup on webview side**: `lastAutoAttachedContent` tracks the last auto-attached selection key (`content:filePath:startLine:endLine`). If the same selection arrives again (user clicks in/out), it's silently dropped. The key resets when the user sends a message, so the same selection can be re-attached for a new question.

## Rationale

- Keeps the webview in control of *when* to check (textarea focus), and the extension in control of *what* to read (VS Code API). Clean separation.
- No visibility listener needed — `focus` on the textarea is the precise user intent signal.
- Dedup prevents chip accumulation from repeated focus events without requiring explicit user action to clear.
