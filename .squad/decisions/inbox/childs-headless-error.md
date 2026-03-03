# Wrong Copilot Binary Detection

**By:** Childs  
**Date:** 2026-03-02  
**Issue:** Windows 11 vsix install bug

## Problem

When the extension is installed via `.vsix` on Windows 11, the `@github/copilot` CLI isn't bundled (due to `.vscodeignore` excluding `node_modules/`). The SDK's `import.meta.resolve("@github/copilot/sdk")` shim fails → `getBundledCliPath()` returns undefined → our code falls back to `where copilot` on PATH.

If the user has a different CLI tool named `copilot` on PATH (not `@github/copilot`), the SDK passes `--headless` to that binary, which doesn't support the flag. Error message: `"CLI server exited with code 1 stderr: error: unknown option '--headless'"`.

The SDK hardcodes `--headless` in spawn args (v0.1.26, line 743 of `dist/client.js`).

## Solution

Enhanced error detection in `getOrCreateClient()` catch block to recognize `--headless` errors as "wrong binary" instead of generic errors.

**Pattern matching:**
- `message.includes("--headless")`
- `message.includes("unknown option") && message.includes("exited with code")`
- `message.includes("error: unknown option")`

When detected, throw `CopilotCliNotFoundError` with actionable message:  
"The 'copilot' binary found on your PATH does not appear to be the GitHub Copilot CLI (@github/copilot). Install it with: npm install -g @github/copilot — then restart VS Code. Or set forge.copilot.cliPath to the correct binary location."

**File modified:** `src/copilotService.ts` (lines 64-95)

## Design Decisions

1. **Detection before general CLI-not-found check** — wrong binary errors are checked first, then generic "not found" errors, ensuring the most specific error message wins.

2. **Case-sensitive matching for --headless** — the `--headless` flag and "unknown option" strings come from command-line tools and are unlikely to vary in case, so we use `includes()` without `.toLowerCase()` for performance.

3. **Multi-pattern redundancy** — three patterns cover different CLI error message formats (short, long, with exit code) to maximize compatibility across shells and binaries.

4. **No CLI resolution changes** — deliberately did NOT change how the CLI is resolved. The fix is purely error detection and messaging, keeping blast radius minimal.

## Testing

- TypeScript typecheck: ✅ `npx tsc --noEmit` passes
- Unit tests: ✅ All 232 tests pass (15 files, 3 todo)
- Build: ⚠️ Pre-existing highlight.js/marked-highlight dependency errors in `media/chat.js` (unrelated to this change)

## Future Work

The build failure suggests missing dependencies in the webview layer — that's Blair's domain (webview owner). This fix is SDK error handling only.
