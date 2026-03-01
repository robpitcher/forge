# Webview JS Bundling with esbuild

**Date:** 2026-03-01
**Author:** Blair
**Context:** Issue #100 — markdown rendering required importing `marked` in the webview JS

## Decision

Webview JavaScript (`media/chat.js`) is now bundled via esbuild as a second entry point (`dist/chat.js`, platform: browser, format: IIFE). This enables `require()` imports of npm packages in webview code.

## Rationale

- The webview JS was previously loaded as a raw script — no imports possible
- Adding `marked` for markdown rendering required a bundling step
- Using esbuild (already our bundler) avoids adding a second tool
- The browser/IIFE output is CSP-compliant (no eval, no inline scripts)
- Air-gap safe: marked is bundled inline, no CDN required

## Impact

- **All squad members**: When adding npm packages to webview code, they're automatically bundled
- **Build output**: `dist/chat.js` now exists alongside `dist/extension.js`
- **Source of truth**: `media/chat.js` remains the source file; `dist/chat.js` is the build artifact
- **Extension manifest**: Webview HTML references `dist/chat.js`, not `media/chat.js`
