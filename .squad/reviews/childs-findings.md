# SDK Integration Review — Childs

## Summary

Deep review of the SDK integration layer for issue #112. The core architecture is well-structured — `buildProviderConfig()`, `buildToolConfig()`, and `buildMcpServersConfig()` DRY helpers are clean, event handling uses the correct named-event pattern with proper unsubscribe cleanup, and the BYOK provider config correctly discriminates `type: "azure"` vs `type: "openai"`. Found 13 findings: 2 high (stale sessions on config change, no CLI crash recovery), 5 medium (cast safety, missing `assistant.message` event, cleanup gap, test endpoint double-suffix, loose tool config typing), 3 low, and 3 informational. No security vulnerabilities in the SDK layer itself.

## Findings

### 🟠 High: Stale sessions survive configuration changes
- **Location:** src/copilotService.ts:149-152, src/extension.ts:46-52
- **Category:** Session Lifecycle
- **Description:** When a user changes endpoint, auth method, model deployment, or any BYOK config in settings, `getOrCreateSession()` returns the cached session from the `sessions` Map without re-evaluating whether the config has drifted. The `onDidChangeConfiguration` listener in extension.ts:46 only refreshes auth status — it does not invalidate existing sessions. A session created with endpoint A continues to be used after the user switches to endpoint B.
- **Impact:** Users change config expecting it to take effect, but the old session (with old endpoint/auth/tools) continues silently. No error, just wrong behavior — messages go to the wrong endpoint or use stale credentials.
- **Remediation:** Either (a) store a config hash alongside each session and check it in `getOrCreateSession()`, destroying stale sessions when config drifts, or (b) listen to `onDidChangeConfiguration` in extension.ts and call `destroyAllSessions()` + post a `conversationReset` when SDK-relevant config keys change. Option (b) is simpler and matches the model-change reset behavior already at extension.ts:417-421.

### 🟠 High: No CopilotClient recovery after CLI process crash
- **Location:** src/copilotService.ts:15, 28-29
- **Category:** Error Recovery
- **Description:** The module-level `client` singleton is set once and reused forever. If the underlying Copilot CLI process crashes (OOM, signal, pipe broken), the `client` object remains in memory but is non-functional. All subsequent calls to `getOrCreateClient()` return the dead client. There is no health-check, no liveness probe, and no re-creation path short of calling `stopClient()` externally.
- **Impact:** After a CLI crash, all chat interactions fail with opaque errors until the user reloads VS Code. The `_handleChatMessage` catch block shows an error, but the user has no way to recover without reloading the window.
- **Remediation:** Add a `resetClient()` export that nulls `client` and clears sessions. In the catch block of `_handleChatMessage` (extension.ts:547-551), detect transport/CLI errors (e.g., "EPIPE", "ERR_IPC_CHANNEL_CLOSED", "process exited") and call `resetClient()` so the next message attempt re-creates the client. Alternatively, wrap `session.send()` and retry once after resetting the client on transport failure.

### 🟡 Medium: `as unknown as ICopilotSession` cast bypasses runtime type safety
- **Location:** src/copilotService.ts:168, src/copilotService.ts:281
- **Category:** SDK Usage
- **Description:** Both `getOrCreateSession()` and `resumeConversation()` cast the SDK return value through `as unknown as ICopilotSession`. This double-cast completely suppresses TypeScript's type checking — if the SDK changes its return shape (renames `send` to `sendMessage`, changes event names, etc.), the compiler won't catch it and the extension will fail at runtime with an obscure `undefined is not a function` error.
- **Impact:** SDK upgrades could silently break the extension. The `ICopilotSession` interface documents the expected shape but provides no compile-time or runtime validation.
- **Remediation:** Add a lightweight runtime assertion after the cast: `if (typeof session.send !== 'function' || typeof session.on !== 'function') throw new Error('SDK session shape mismatch — check copilot-sdk version')`. This converts a silent runtime bug into an immediate, actionable error. Long-term, remove the cast when the SDK exports `CopilotSession` with proper event method types.

### 🟡 Medium: `assistant.message` event not subscribed in `_streamResponse`
- **Location:** src/extension.ts:621-705
- **Category:** Events
- **Description:** The SDK emits both `assistant.message_delta` (incremental tokens) and `assistant.message` (complete response). `_streamResponse` only subscribes to `message_delta` and relies on `session.idle` for completion. The `assistant.message` event — which carries the full response — is never consumed.
- **Impact:** Currently functional because `accumulatedContent` is built from deltas. However, if a delta is dropped (race condition, backpressure), the cached `_conversationMessages` will have an incomplete assistant response with no reconciliation. The `assistant.message` event could serve as a final consistency check.
- **Remediation:** Subscribe to `assistant.message` and use it to validate/replace `accumulatedContent` before caching. Low-cost insurance against dropped deltas.

### 🟡 Medium: `destroySession` aborts but `removeSession` silently leaks
- **Location:** src/copilotService.ts:174-176, 178-193
- **Category:** Cleanup
- **Description:** `removeSession()` does a bare Map delete without aborting — the session remains alive in the SDK. `destroySession()` correctly aborts and deletes. Both are exported. In production code, `destroySession` is used correctly, but `removeSession` is imported in tests and could be accidentally used in production, leaking sessions in the CLI process.
- **Impact:** If `removeSession` is used instead of `destroySession` in production code, sessions leak. Currently only a test concern, but a maintenance trap.
- **Remediation:** Either (a) unexport `removeSession` and use `destroySession` everywhere (including tests), or (b) have `removeSession` call `abort()` too so both functions are safe.

### 🟡 Medium: Test config endpoint includes `/openai/v1/` suffix — masks a real bug
- **Location:** src/test/copilotService.test.ts:22
- **Category:** Provider Config
- **Description:** The test config uses `endpoint: "https://myresource.openai.azure.com/openai/v1/"`. Per SDK docs (and the repo instructions), when `type: "azure"` is set, the SDK auto-appends `/openai/v1/` to `baseUrl`. The test validates that this URL is passed through to `baseUrl` — meaning in production the SDK would call `https://...azure.com/openai/v1/openai/v1/` (double-suffixed). The test passes because it's mocked, but it validates incorrect behavior.
- **Impact:** If a user configures endpoint with the path included (as the test suggests is valid), API calls will fail with 404. The `buildProviderConfig` function passes `config.endpoint` through without stripping the path.
- **Remediation:** (a) Strip trailing `/openai/v1/` or `/openai/` from the endpoint in `buildProviderConfig()` when `type: "azure"`, (b) fix the test config to use a bare endpoint like `https://myresource.openai.azure.com/`, (c) add a config validation warning for endpoints that already contain `/openai/`.

### 🟡 Medium: `buildToolConfig` returns `Record<string, unknown>` — loose typing
- **Location:** src/copilotService.ts:128-140
- **Category:** Tools
- **Description:** `buildToolConfig()` returns `Record<string, unknown>` and its result is spread into `createSession` options. The `excludedTools` property name is not type-checked. If the SDK renames it or a typo is introduced, the compiler won't catch it — tools will silently be enabled.
- **Impact:** Low probability but high consequence — a typo means all tools are enabled silently.
- **Remediation:** Define a proper return type: `{ excludedTools?: string[] }` instead of `Record<string, unknown>`.

### 🟢 Low: `systemMessage` uses append mode only — no user control over mode
- **Location:** src/copilotService.ts:166
- **Category:** SDK Usage
- **Description:** System message is always `{ content: config.systemMessage }` without `mode`. Per SDK, omitting `mode` means append (the default). There's no way for users to replace the SDK's default system prompt entirely.
- **Impact:** Users who need full prompt control can't achieve it. This is intentionally safer (append), but undocumented.
- **Remediation:** No immediate change. Document as intentional limitation. If needed later, add a `forge.copilot.systemMessageMode` setting.

### 🟢 Low: `getOrCreateSession` does not validate model against config.models
- **Location:** src/copilotService.ts:142-172
- **Category:** SDK Usage
- **Description:** The `model` parameter is passed to `createSession` without checking if it exists in `config.models`. A programmatic caller could pass an invalid model name.
- **Impact:** The SDK rejects it at the API level — not a bug, but an unnecessary round-trip and confusing error.
- **Remediation:** Consider validating `model` against `config.models` with a clear error message.

### 🟢 Low: Module-level `sessions` Map has no size limit
- **Location:** src/copilotService.ts:16
- **Category:** State
- **Description:** The `sessions` Map grows unbounded. Normal flow (`destroySession` on new conversation) keeps it bounded, but `resumeConversation` adds historical sessions with no upper bound.
- **Impact:** Extremely unlikely to matter in practice. `getSessionCount()` (line 223) exists for diagnostics but is never called.
- **Remediation:** No action needed. Monitor if session count becomes an issue.

### ℹ️ Info: `removeSession` exported but only used in tests
- **Location:** src/copilotService.ts:174-176
- **Category:** Cleanup
- **Description:** `removeSession` is a bare Map delete — no abort. Only imported in tests. Production code always uses `destroySession`. See the Medium finding above for the maintenance risk.
- **Impact:** Test-only concern currently.
- **Remediation:** See Medium finding above.

### ℹ️ Info: `buildMcpServersConfig` doesn't enforce `allowRemoteMcp`
- **Location:** src/copilotService.ts:97-123, src/configuration.ts:105-113
- **Category:** Tools
- **Description:** The `allowRemoteMcp` check only runs in `validateConfiguration()`. If `buildMcpServersConfig()` were called without prior validation (e.g., a future code path), remote servers could be wired in without opt-in. Currently, both `_handleChatMessage` and `_handleResumeConversation` validate first, so this is defense-in-depth only.
- **Impact:** No current exploit. Future-proofing concern.
- **Remediation:** Consider adding a redundant `allowRemoteMcp` check in `buildMcpServersConfig()` as defense-in-depth.

### ℹ️ Info: Tool event types in `ICopilotSession` not exhaustive
- **Location:** src/types.ts:180-197
- **Category:** Events
- **Description:** `ICopilotSession` has typed overloads for `assistant.message_delta`, `session.idle`, `session.error`, plus a generic `on(event: string, handler)` catch-all. Tool events (`tool.execution_start`, `tool.execution_complete`, `tool.execution_progress`, `tool.execution_partial_result`) have payload types defined (lines 94-135) but no typed overloads — they use the generic string overload, so handlers receive `any`.
- **Impact:** No type safety for tool event handlers. The types exist but aren't wired to the session interface.
- **Remediation:** Add typed overloads for tool events in `ICopilotSession`. Low priority since payloads are validated manually with `?.` in `_streamResponse`.

---

## Correct Patterns (Verified ✅)

1. **BYOK Provider Config** — `type: "azure"` for `.azure.com`, `type: "openai"` for others. `bearerToken` vs `apiKey` correctly selected by `authMethod`. Azure `apiVersion` set. ✅
2. **Session Lifecycle** — Keyed by conversation ID, reused within conversation, `sessionId` passed to `createSession()` (PR #102 fix). ✅
3. **Event Pattern** — Named-event with unsubscribe cleanup. No catch-all pattern. ✅
4. **Client Stop** — `client.stop()` in `finally` block in `stopClient()`. ✅
5. **Tool Config** — `excludedTools` built from boolean settings. Empty array = exclude nothing. ✅
6. **MCP Config** — Local `type: "local"`, remote `type: "http"`. `tools: ["*"]`. ✅
7. **System Message** — Object shape `{ content }`, not plain string. Empty values omitted. ✅
8. **Permission Handler** — `onPermissionRequest` callback with timeout. Pending permissions rejected on conversation reset. ✅

---

## Summary Statistics

| Severity | Count | Key Items |
|----------|-------|-----------|
| 🟠 High | 2 | Stale sessions on config change, no CLI crash recovery |
| 🟡 Medium | 5 | Cast safety, missing `assistant.message`, cleanup gap, test endpoint, tool typing |
| 🟢 Low | 3 | Append-only system message, model validation, session map unbounded |
| ℹ️ Info | 3 | removeSession export, MCP allowRemote, tool event types |

**Total: 13 findings (10 actionable, 3 informational)**

**Verdict:** Core SDK integration is solid and production-ready. The two High findings (stale sessions, crash recovery) should be fixed before distribution — both are user-facing reliability issues with straightforward remediation.
