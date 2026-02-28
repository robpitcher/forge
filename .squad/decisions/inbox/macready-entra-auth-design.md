### Design Review: #27 DefaultAzureCredential Auth
**Facilitator:** MacReady
**Date:** 2026-02-28

#### Architecture Decisions

1. **New `src/auth/credentialProvider.ts` module.** Don't inline this in copilotService or configuration. Clean separation. Single Responsibility. This file owns the `CredentialProvider` interface and both implementations.

2. **Interface is one method: `getToken(): Promise<string>`.** Returns the raw token/key string — not an auth header, not a bearer prefix. The caller (copilotService) decides whether to set `bearerToken` or `apiKey` on ProviderConfig. This keeps the provider dumb and testable.

   ```typescript
   export interface CredentialProvider {
     getToken(): Promise<string>;
   }
   ```

3. **Two implementations in the same file:**
   - `EntraIdCredentialProvider` — wraps `DefaultAzureCredential` from `@azure/identity`. Calls `.getToken("https://cognitiveservices.azure.com/.default")` and returns `token.token`. The SDK handles caching/refresh internally, so we call `getToken()` fresh before each `createSession()` — it returns cached if still valid.
   - `ApiKeyCredentialProvider` — takes a string, returns it. Trivial but keeps the calling code uniform.

4. **Factory function: `createCredentialProvider(config: ExtensionConfig, secrets: vscode.SecretStorage): CredentialProvider`.** Lives in `credentialProvider.ts`. Reads `config.authMethod` to pick the implementation. For `apiKey` mode, reads from SecretStorage. For `entraId` mode, instantiates `DefaultAzureCredential` (no config needed — SDK reads environment).

5. **`authMethod` setting: `forge.copilot.authMethod` with enum `["entraId", "apiKey"]`, default `"entraId"`.** Added to `package.json` contributes.configuration. Added to `ExtensionConfig` interface as `authMethod: "entraId" | "apiKey"`. Read in `getConfiguration()`.

6. **`getOrCreateSession()` changes:** Takes a `CredentialProvider` parameter (or the token string directly). Before building ProviderConfig, call `credentialProvider.getToken()`. Then:
   - If `authMethod === "entraId"`: set `provider.bearerToken = token`, omit `apiKey`
   - If `authMethod === "apiKey"`: set `provider.apiKey = token`, omit `bearerToken`

   **Decision: Pass the token, not the provider.** The caller (`extension.ts`) resolves the token before calling `getOrCreateSession()`. This keeps copilotService free of auth concerns beyond ProviderConfig wiring. Signature becomes:
   ```typescript
   export async function getOrCreateSession(
     conversationId: string,
     config: ExtensionConfig,
     authToken: string,
     onPermissionRequest?: PermissionHandler,
   ): Promise<ICopilotSession>
   ```
   The caller does: `const token = await credentialProvider.getToken();` then passes it.

7. **Validation: skip API key check when `authMethod === "entraId"`.** In `validateConfiguration()`, wrap the apiKey check in `if (config.authMethod === "apiKey")`. No new validation for entraId — if DefaultAzureCredential fails, it throws at token acquisition time and we surface that error in the chat UI.

8. **`@azure/identity` is a runtime dependency.** Add to `dependencies` in `package.json`, not `devDependencies`. esbuild will bundle it. **Risk: VSIX size increase** — see Risks below.

9. **No lazy import of `@azure/identity`.** Import it normally in `credentialProvider.ts`. The module is only loaded when `EntraIdCredentialProvider` is instantiated, which only happens when `authMethod === "entraId"`. Actually — **correction: use dynamic `import()` in the factory function** so that `@azure/identity` is never loaded when using apiKey mode. This avoids bundling issues if we later make it an optional dep.

   ```typescript
   // In createCredentialProvider, when authMethod === "entraId":
   const { DefaultAzureCredential } = await import("@azure/identity");
   ```

10. **Session-per-conversation token lifecycle is acceptable.** Tokens live ~1hr. Sessions are created per conversation. If a conversation runs longer than 1hr and the token expires mid-session, the user gets an auth error — they start a new conversation. This is fine for Phase 3a. Phase 3b can add session recreation with fresh token if needed.

#### File Ownership

- **Childs** (SDK integration):
  - `src/auth/credentialProvider.ts` — **NEW FILE.** Define `CredentialProvider` interface, `EntraIdCredentialProvider` class, `ApiKeyCredentialProvider` class, `createCredentialProvider()` factory function.
  - `src/copilotService.ts` — Modify `getOrCreateSession()` signature to accept `authToken: string`. Use it to set either `bearerToken` or `apiKey` on ProviderConfig based on `config.authMethod`. Remove hardcoded `apiKey: config.apiKey`.
  - `src/types.ts` — Already done (`bearerToken?: string` on ProviderConfig). No further changes.

- **Blair** (VS Code settings/config):
  - `package.json` — Add `forge.copilot.authMethod` enum setting to `contributes.configuration`. Add `@azure/identity` to `dependencies`.
  - `src/configuration.ts` — Add `authMethod: "entraId" | "apiKey"` to `ExtensionConfig`. Read it in `getConfiguration()` with default `"entraId"`. Update `validateConfiguration()` to skip API key check when `authMethod === "entraId"`.
  - `src/extension.ts` — In the request handler, create credential provider via factory, call `getToken()`, pass token to `getOrCreateSession()`. Handle token acquisition errors (display in chat stream).

- **Windows** (testing):
  - `src/test/auth/credentialProvider.test.ts` — Unit tests for both credential providers and the factory.
  - `src/test/copilotService.test.ts` — Test that `getOrCreateSession` passes `bearerToken` when entraId, `apiKey` when apiKey mode.
  - `src/test/configuration.test.ts` — Test that validation skips apiKey check for entraId.
  - Manual: Verify VSIX size stays under 10MB with `@azure/identity` bundled.

- **Docs** (Blair or @copilot):
  - `README.md` — Update auth section per issue #27 requirements.
  - `docs/configuration-reference.md` — Add `forge.copilot.authMethod` setting.
  - `docs/installation-guide.md` — Update setup flow to recommend Entra ID first.

#### Contracts / Interfaces

**1. `CredentialProvider` interface** (Childs defines in `src/auth/credentialProvider.ts`):
```typescript
export interface CredentialProvider {
  getToken(): Promise<string>;
}

export function createCredentialProvider(
  config: ExtensionConfig,
  secrets: vscode.SecretStorage,
): CredentialProvider;
```

**2. `ExtensionConfig.authMethod`** (Blair adds to `src/configuration.ts`):
```typescript
export interface ExtensionConfig {
  endpoint: string;
  apiKey: string;        // kept for apiKey mode
  authMethod: "entraId" | "apiKey";
  model: string;
  wireApi: string;
  cliPath: string;
  autoApproveTools?: boolean;
}
```

**3. `getOrCreateSession()` updated signature** (Childs modifies in `src/copilotService.ts`):
```typescript
export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession>
```

**4. ProviderConfig auth wiring** (Childs, in `getOrCreateSession()`):
```typescript
const provider: ProviderConfig = {
  type: isAzure ? "azure" : "openai",
  baseUrl: config.endpoint,
  wireApi,
  ...(config.authMethod === "entraId"
    ? { bearerToken: authToken }
    : { apiKey: authToken }),
  ...(isAzure && { azure: { apiVersion: "2024-10-21" } }),
};
```

**5. Token scope constant** (Childs, in `credentialProvider.ts`):
```typescript
const AZURE_COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";
```

#### Risks

1. **VSIX size with `@azure/identity`.** The `@azure/identity` package and its transitive deps (`@azure/core-auth`, `@azure/core-rest-pipeline`, `msal-node`, etc.) are substantial. esbuild bundling may push VSIX past the 10MB NFR8 limit. **Mitigation:** Measure VSIX size after adding the dep. If too large, consider making `@azure/identity` an optional peer dep with dynamic import and graceful error if missing. Decision 9 (dynamic import) partially mitigates this.

2. **Air-gapped environments and DefaultAzureCredential.** In a truly air-gapped network, the Entra ID token endpoint (`login.microsoftonline.com`) may be unreachable. DefaultAzureCredential will fail for all credential types except Managed Identity (which uses IMDS at `169.254.169.254`). **Mitigation:** API key fallback exists. Document that `entraId` mode requires network access to the identity endpoint OR Managed Identity.

3. **Token expiry mid-session.** If a session lasts >1hr, the bearer token expires and subsequent `session.send()` calls will fail with 401. **Mitigation:** Acceptable for Phase 3a. Document the limitation. Phase 3b could add session recreation logic.

4. **`DefaultAzureCredential` error messages are verbose and confusing.** When no credential in the chain succeeds, the SDK throws an `AggregateAuthenticationError` with messages from every failed provider. **Mitigation:** Catch this in `extension.ts` when calling `getToken()` and surface a user-friendly message: "Entra ID authentication failed. Ensure you're signed in to Azure CLI, VS Code Azure Account, or running on a VM with Managed Identity. Alternatively, switch to API key auth."

5. **Provider type detection.** Current code uses regex `/\.azure\.com/i` to detect Azure endpoints. This should also set `type: "azure"` when using Entra ID, since bearer tokens with Azure OpenAI require the Azure provider type. **Mitigation:** The existing logic already handles this. Just verify it still works when `apiKey` field is omitted from ProviderConfig (SDK might require it even if empty).

6. **Breaking change to `getOrCreateSession()` signature.** Adding `authToken` parameter changes the contract. All callers in `extension.ts` must be updated. **Mitigation:** This is a coordinated change — Blair updates the caller, Childs updates the function. Low risk if done in same PR or coordinated branches.
