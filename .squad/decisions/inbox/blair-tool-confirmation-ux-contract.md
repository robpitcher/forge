### Tool Confirmation UX Message Contract
**By:** Blair
**What:** The webview tool confirmation/result protocol is implemented in `media/chat.js` and `media/chat.css`. The message contract between extension.ts and the webview is:

- **Extension → Webview:** `{ type: "toolConfirmation", id: string, tool: string, params: object }` — renders inline approval card
- **Extension → Webview:** `{ type: "toolResult", id: string, tool: string, status: "success"|"error", output?: string }` — renders compact result indicator
- **Webview → Extension:** `{ command: "toolResponse", id: string, approved: boolean }` — user's approval/rejection response

Childs should wire `_handleMessage` in extension.ts to handle the `toolResponse` command, and post `toolConfirmation`/`toolResult` messages to the webview during tool execution flow.

**Context:** Issue #25 — Enable Copilot CLI built-in tools
