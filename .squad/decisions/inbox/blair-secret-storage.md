### 2026-02-27: API Key Storage Migrated to SecretStorage

**By:** Blair
**What:** The `enclave.copilot.apiKey` setting is now stored via VS Code's SecretStorage API (`context.secrets`) instead of plain-text settings.json. The settings gear button shows a QuickPick menu with "Open Settings" and "Set API Key (secure)" options. The secure option uses a password input box with native masking. `getConfigurationAsync()` in `src/configuration.ts` checks SecretStorage first, falls back to settings.json for backward compatibility.

**Why:** API keys in settings.json are visible in plain text. SecretStorage uses the OS keychain (Credential Manager on Windows, Keychain on macOS, libsecret on Linux) which is the VS Code-recommended approach for secrets.

**Impact:**
- `src/configuration.ts` now exports `getConfigurationAsync(secrets)` — any code reading config that needs the API key should use this async version.
- `src/extension.ts` `ChatViewProvider` constructor now requires `context.secrets` as second parameter.
- All test files calling `activate()` must include a `secrets` mock on the ExtensionContext.
- The sync `getConfiguration()` still exists for non-secret settings but won't include SecretStorage values.
