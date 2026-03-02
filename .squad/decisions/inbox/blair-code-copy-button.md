# Decision: Code Block Copy Button Pattern

**Author:** Blair (Extension Dev)
**Date:** 2025-07-25
**Status:** Implemented

## Context
Chat messages render markdown via `marked.parse()`. Code blocks (`<pre>`) need a copy-to-clipboard button for usability.

## Decision
- Copy button injection is a standalone `addCopyButtons(container)` function called after every markdown render pass (both complete messages and streaming deltas).
- Uses inline SVG icon — CSP-safe, no external resources.
- Uses `navigator.clipboard.writeText()` which works in VS Code webviews.
- Button uses `position: absolute` inside a `position: relative` `<pre>`, hidden by default (`opacity: 0`), visible on `pre:hover`.
- Duplicate guard: checks for existing `.code-copy-btn` before injecting (important since streaming re-renders the full DOM each delta).

## Consequences
- Any future code that renders markdown into the chat (e.g. conversation restore, tool results) should call `addCopyButtons()` on the rendered container.
- The SVG icon markup is duplicated (initial render + reset after "Copied!" feedback) — acceptable for a small inline SVG.
