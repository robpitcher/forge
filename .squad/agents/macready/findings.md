# Code Health & Cleanup Assessment
**MacReady Review Synthesis** | 6,844 LOC | 17 test files (295 tests passing)

---

## Current State Assessment

**Positive signals:**
- ✅ Full test coverage (17 test files, 295 passing tests, 0 failures)
- ✅ Type safety enforced (`tsconfig.json` strict mode, `npm run lint:types` clean)
- ✅ Build succeeds cleanly (esbuild)
- ✅ CSP headers properly configured in webview HTML
- ✅ DOMPurify sanitization in place for markdown rendering (`media/chat.js`)
- ✅ 42 try-catch blocks, 12 promise catches (reasonable error handling depth)
- ✅ No `eval`, `new Function`, or `dangerouslySetInnerHTML` patterns detected
- ✅ Air-gap compliance validated (no external network calls except configured endpoint)

**Debt indicators:**
- ⚠️ 9 ESLint `no-console` warnings (logging infrastructure not fully unified)
- ⚠️ 2 TODO comments referencing issue #27 (Entra ID SDK-native support) — decision not documented
- ⚠️ `checkAuthStatus()` marked "never throws" but relies on `createCredentialProvider()` which is async
- ⚠️ ~1,000 LOC in `media/chat.js` (monolithic webview; no modularization)
- ⚠️ 2 outdated dependencies: `@github/copilot-sdk` (0.1.26 → 0.1.30), `@types/node` (25.3.2 → 25.3.3)

---

## Top 5 Cleanup Priorities

### 1. **Consolidate Logging & Remove Console Statements** (High Impact)
- **Issue:** 9 console.* calls scattered across `copilotService.ts` (6), `media/chat.js` (1), `extension.ts` (3)
- **Risk:** No central logging, inconsistent output, difficult to mute in production
- **Action:** Replace with `outputChannel.appendLine()` in `extension.ts` and `console.error()` → log service in main code
- **Files:** `src/copilotService.ts:488,577,593,599,632,636,643`, `src/extension.ts:71,76,88`
- **Effort:** Low (regex + replace pattern)

### 2. **Document Issue #27 Decision** (Medium Impact)
- **Issue:** Two TODO comments reference #27 (Entra ID / SDK-native auth support), but the decision is not in `.squad/decisions.md`
- **Risk:** Future maintainers don't understand the workaround or when to revisit
- **Action:** Write decision doc explaining `bearerToken` static-string limitation + token refresh strategy + when/how to refactor
- **Files:** `.squad/decisions.md` (new entry), `src/types.ts:165`, `src/copilotService.ts:507`
- **Effort:** Low (documentation only)

### 3. **Update Outdated Dependencies** (Low Risk)
- **Issue:** `@github/copilot-sdk` 0.1.26 → 0.1.30, `@types/node` 25.3.2 → 25.3.3 (patch/minor only)
- **Risk:** Missing security patches, type improvements
- **Action:** Run `npm update` and verify tests pass
- **Effort:** Very Low (automated)
- **Dependencies:** None (independent from other cleanups)

### 4. **Refactor Webview Logic** (Medium Effort, Medium Impact)
- **Issue:** `media/chat.js` is 1,027 LOC monolith — no separation of concerns, hard to test/maintain
- **Risk:** Difficult to add features, test individual UX components, or refactor styling without breaking interactions
- **Action:** Split into modules: `ui.js` (DOM manipulation), `markdown.js` (rendering), `messages.js` (message handling), `history.js` (conversation history)
- **Effort:** Medium (refactoring, not rewriting)
- **Dependencies:** Can proceed independently after logging consolidation

### 5. **Fix "Never Throws" Error Boundary Contract** (Low Risk)
- **Issue:** `checkAuthStatus()` JSDoc says "never throws" but calls async `createCredentialProvider()` without explicit error boundary
- **Risk:** Misleading contract; callers might not wrap properly
- **Action:** Add explicit try-catch wrapping around `createCredentialProvider()` OR update JSDoc to reflect actual behavior
- **Files:** `src/auth/authStatusProvider.ts:20-80`
- **Effort:** Very Low (already has catch blocks, just clarify scope)

---

## Cross-Cutting Concerns

### 1. **Logging & Observability**
- Console statements bypass VS Code's `OutputChannel` — can't be muted, filtered, or persisted per-session
- **Recommendation:** Standardize on `outputChannel.appendLine()` for user-facing events; reserve `console` for SDK-level diagnostics only
- **Impact:** All modules affected (extension.ts, copilotService.ts, media/chat.js)

### 2. **Error Message Consistency**
- Error messages vary in tone & specificity (e.g., "Entra ID configuration error" vs "Failed to abort session")
- **Recommendation:** Create error taxonomy (`AuthError`, `SessionError`, `CliError`) with standard messages
- **Impact:** `copilotService.ts`, `auth/`, `cliInstaller.ts`

### 3. **SDK Version Pinning & Upgrade Readiness**
- `@github/copilot-sdk 0.1.26` is pinned; SDK is pre-1.0 and may have breaking changes
- **Recommendation:** Monitor 0.1.30 release notes before upgrading; consider using SemVer ranges once SDK reaches 1.0
- **Impact:** `package.json`; track in `CHANGELOG.md` per recent additions

### 4. **Test Coverage Gaps**
- 17 test files, 295 tests, but no skipped tests — good coverage
- **Minor gap:** `media/chat.js` has zero unit tests (monolithic, hard to test in isolation)
- **Recommendation:** Establish `src/test/webview/` tests once chat.js is modularized

---

## Risk Assessment

| Priority | Task | Risk | Blockers | Timeline |
|----------|------|------|----------|----------|
| 1 | Consolidate logging | **Low** | None | 2–3 hours |
| 2 | Document #27 decision | **None** | None | 30 mins |
| 3 | Update dependencies | **Low** | None | 30 mins |
| 4 | Refactor chat.js | **Medium** | Manual testing required | 1–2 days |
| 5 | Fix error boundary contract | **None** | None | 15 mins |

**Overall health:** **Green** — no critical issues, debt is manageable and non-blocking. Recommended approach: **#2 first** (unblocks future decisions), then **#3** (low-hanging fruit), then **#1** (improves observability), then tackle **#4** when feature velocity stabilizes.

---

## Files Requiring Attention (Priority Order)

1. `.squad/decisions.md` — Add decision for issue #27
2. `package.json` — Update dependencies
3. `src/copilotService.ts` — Remove console statements, unify logging
4. `src/extension.ts` — Remove console statements, route to outputChannel
5. `src/auth/authStatusProvider.ts` — Clarify "never throws" contract
6. `media/chat.js` — Modularize (future sprint)
