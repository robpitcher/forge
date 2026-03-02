# Decision: Sanitize markdown HTML with DOMPurify

**Date:** 2025-07-25
**Author:** Blair (Extension Dev)
**Status:** Implemented

## Context

PR #109 introduced `marked.parse()` for rendering assistant messages as HTML. Copilot's PR review flagged that the parsed output was assigned directly to `innerHTML` without sanitization, creating a cross-site scripting (XSS) risk. If the AI model returns content containing malicious HTML or script tags, they would execute in the webview.

## Decision

Added `dompurify` as a dependency and wrapped all `marked.parse()` calls with `DOMPurify.sanitize()` in the centralized `renderMarkdown()` function. Using DOMPurify's default configuration, which preserves all standard HTML elements needed for markdown (code blocks, tables, headings, lists, links) while stripping dangerous content (scripts, event handlers, etc.).

## Implications

- All markdown-to-HTML rendering goes through a single sanitized path
- New code that renders markdown should use `renderMarkdown()` — never call `marked.parse()` directly for innerHTML assignment
- DOMPurify is bundled into `dist/chat.js` via the existing esbuild browser/IIFE build — no separate script tag needed
- Default DOMPurify config is sufficient; no custom allowlist maintained
