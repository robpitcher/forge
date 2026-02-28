import type * as vscode from "vscode";
import type { ExtensionConfig } from "../configuration.js";

const AZURE_COGNITIVE_SERVICES_SCOPE =
  "https://cognitiveservices.azure.com/.default";

/**
 * Abstraction for obtaining an auth token — either an API key or
 * a bearer token from Entra ID / DefaultAzureCredential.
 */
export interface CredentialProvider {
  getToken(): Promise<string>;
}

/**
 * Wraps `@azure/identity` DefaultAzureCredential.
 * Calls `.getToken()` with the Cognitive Services scope and returns the raw token string.
 * The Azure Identity SDK caches tokens internally, so repeated calls are cheap.
 */
export class EntraIdCredentialProvider implements CredentialProvider {
  private credential: { getToken(scope: string): Promise<{ token: string }> };

  constructor(credential: {
    getToken(scope: string): Promise<{ token: string }>;
  }) {
    this.credential = credential;
  }

  async getToken(): Promise<string> {
    const result = await this.credential.getToken(
      AZURE_COGNITIVE_SERVICES_SCOPE,
    );
    return result.token;
  }
}

/**
 * Trivial provider that returns a static API key string.
 * Keeps the calling code uniform regardless of auth method.
 */
export class ApiKeyCredentialProvider implements CredentialProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getToken(): Promise<string> {
    return this.apiKey;
  }
}

/**
 * Factory: reads `config.authMethod` and returns the appropriate provider.
 * Uses dynamic `import("@azure/identity")` for entraId mode so the package
 * is never loaded when using apiKey auth.
 */
export async function createCredentialProvider(
  config: ExtensionConfig,
  secrets: vscode.SecretStorage,
): Promise<CredentialProvider> {
  if (config.authMethod === "entraId") {
    const { DefaultAzureCredential } = await import("@azure/identity");
    return new EntraIdCredentialProvider(new DefaultAzureCredential());
  }

  // apiKey mode — read from SecretStorage
  const apiKey = (await secrets.get("forge.copilot.apiKey")) ?? "";
  return new ApiKeyCredentialProvider(apiKey);
}
