### Auth UX Fixes — Sign-In Flow and Status Feedback
**By:** Blair
**What:** Four auth UX changes per Rob's feedback:

1. **`forge.signIn` command** — Status bar click now runs `az login` in a VS Code terminal for Entra ID users, or opens the settings QuickPick for API key users. Replaces the previous `forge.openSettings` command on the status bar.

2. **Auth polling** — A 30-second `setInterval` and `onDidChangeWindowState` focus listener re-check auth status automatically. This catches `az login` completions without requiring settings changes. Both are disposable and cleaned up on deactivation.

3. **Webview banner** — `notAuthenticated` state shows "🔐 Sign in to start chatting" with a "Sign In" button. `error` state truncates messages to 80 chars and shows a "Troubleshoot" button. Less alarming, more actionable.

4. **Auth-method-aware status bar** — Different codicons and text per auth method: `$(sign-in)` for Entra ID, `$(key)` for API key, `$(warning)` for errors. Error text says "Auth Issue" instead of "Auth Error".

**Files changed:** `src/extension.ts`, `media/chat.js`, `package.json`, `src/test/__mocks__/vscode.ts`
**Note for Windows:** The vscode mock now includes `Disposable` class, `onDidChangeWindowState`, and `createTerminal`. The pre-existing `error-scenarios.test.ts` failure ("posts error when API key is missing") predates this change — it broke when authMethod was introduced in #27.
