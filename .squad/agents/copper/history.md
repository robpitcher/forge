# Copper — History

## Project Context
- **Project:** Forge — VS Code extension for AI chat in air-gapped environments via Azure AI Foundry
- **Stack:** TypeScript, VS Code Extension API, @github/copilot-sdk, esbuild, vitest
- **Owner:** Rob Pitcher
- **Joined:** 2026-03-02

## Learnings

### 2026-03-02: Comprehensive Code Quality Review for #112

**Scope:** All TypeScript source files and webview JavaScript  
**Focus:** Error handling, race conditions, type safety, resource leaks, dead code

**Key Findings:**
- **Critical race condition in session creation** — `_isProcessing` flag set too late, allowing concurrent session creation for same conversation ID
- **Missing error handling in auth callbacks** — `.catch(() => {})` swallows all errors including SecretStorage failures
- **console.warn/error usage** — Should use VS Code OutputChannel for user-facing logs instead of Extension Host console
- **Missing await on async cleanup** — Several `destroySession()` calls not awaited, causing silent failures
- **Missing return type annotations** — 22 functions without explicit return types reduce maintainability
- **Magic strings for message types** — Repeated string literals throughout message passing code, no centralized enum

**Patterns Observed:**
- Defensive `.catch(() => {})` pattern is overused for fire-and-forget operations — should at least log to output channel
- Good use of try-catch around credential and SDK operations, but some paths still expose raw SDK errors to users
- Event listener cleanup uses the unsubscribe pattern correctly (named events + cleanup in finally blocks)
- Context attachment and truncation logic is well-structured with clear budget enforcement

**Recommendations for Team:**
- Establish error handling policy: when is `.catch(() => {})` acceptable vs. when must errors be logged/surfaced?
- Create message type enum to prevent string literal typos
- Add OutputChannel for extension-specific logging
- Review all `.catch(() => {})` callsites and add logging for debugging
- Consider adding session creation lock to prevent race conditions

### 2025-07-22: Follow-up Code Quality Review for #112

**Scope:** Full re-review of all TypeScript source + webview JS after codebase evolution  
**Findings:** 16 issues (2 critical, 2 high, 6 medium, 4 low, 2 info)

**New Findings Since Last Review:**
- **Critical: `createCredentialProvider` not in try-catch** — dynamic `import("@azure/identity")` at extension.ts:494 can throw without user feedback
- **High: Copy-paste bug in status bar tooltip** — API Key auth shows "Click to sign in with Azure CLI" (extension.ts:229)
- **High: `any` type on tool.execution_complete handler** — extension.ts:666 uses `any` despite `ToolExecutionCompleteEvent` being defined and imported
- **Medium: Dead code** — `getSessionCount()` (copilotService.ts:223) never used/exported; `removeSession()` unused in prod
- **Medium: Magic number 8000 duplicated** — hardcoded at extension.ts:139 outside the class constant at :557
- **Medium: clipboard.writeText missing .catch()** — chat.js:256

**Persistent Findings (still open from prior review):**
- Race condition in `_isProcessing` (extension.ts:476-534) — still present
- `console.warn` instead of OutputChannel — still present
- Fire-and-forget `.catch(() => {})` — still present
- Message type strings not centralized — still present

**Output:** `.squad/reviews/copper-findings.md`
