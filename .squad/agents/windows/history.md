# Project Context

- **Owner:** Rob Pitcher
- **Project:** Enclave — VS Code extension providing Copilot Chat for air-gapped environments. Uses @github/copilot-sdk in BYOK mode to route inference to private Azure AI Foundry endpoint. No GitHub auth, no internet.
- **Stack:** TypeScript, VS Code Extension API (Chat Participant), @github/copilot-sdk, esbuild, Azure AI Foundry
- **Created:** 2026-02-27

## Core Context

**Recent work:** Workspace awareness feature testing (9 tests added, all passing). Prior work includes integration testing suite, code review validation, test coverage analysis. Focus: ensuring SDK integration stability and comprehensive test coverage.

**Key patterns:** Dynamic imports converted to static, mock SMS arguments match real SDK interface, test isolation via stopClient() works reliably.

**Next phase:** Merge workspace awareness tests to dev. Monitor for test suite gaps in new features.

**Full history:** See .squad/decisions.md and prior orchestration logs.

---

📌 Team update (2026-03-05): Workspace Awareness testing complete — added 9 tests covering all scenarios (webview indicator, session recreation, no-folder case, resume). All 300 tests green. Feature ready for merge to dev.

📌 Team update: Progress indicator + stop button tests added (issue #122). 7 new tests in extension.test.ts covering:
- Processing phase state machine (thinking → generating → idle transitions)
- Phase posted on completion and on error
- stopRequest triggers session.abort()
- stopRequest when idle is a safe no-op
All 301 tests green. Blair's implementation was in the working tree (uncommitted on squad/122-progress-stop-button).

## Learnings

- Blair's `_processingPhase` state machine replaces the binary `_isProcessing` flag. Phase transitions: idle → thinking (message start) → generating (before _streamResponse) → idle (finally block). Tests must check the full sequence, not just individual phases.
- `_currentSession` is set just before `_streamResponse` and cleared in the finally block. Stop requests can only work during the generating phase — testing requires `session.send` to hang (never-resolving promise) so the test can inject a stopRequest mid-stream.
- The `stopRequest` handler is a no-op when `_currentSession` is null or phase is "idle". The no-op test confirms no crash and no abort call — important edge case for button spam.
- To test thinking-phase cancellation, delay `mockClient.createSession` (not `getOrCreateSession`) and wait for `expect(mockClient.createSession).toHaveBeenCalled()` before injecting the stopRequest. The thinking phase is posted synchronously but the handler progresses through async config/auth steps before reaching session creation — you must wait for `createSession` to actually be invoked.
- Blair's `_requestId` guard in the finally block (`if (this._requestId === myRequestId)`) prevents stale request cleanup from clobbering a newer request. To test this race condition: start request A with a controlled send promise, stopRequest to reset phase, start request B, then reject A's promise — A's finally skips because requestId has incremented.
- `_handleChatMessage` early-returns when `_processingPhase !== "idle"`, which is the duplicate send prevention guard. Test by hanging send, confirming generating phase, then calling `simulateUserMessage` again and verifying `streamStart` count stays at 1.
