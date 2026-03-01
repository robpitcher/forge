import type * as vscode from "vscode";
import type { ExtensionConfig } from "../configuration.js";
import { createCredentialProvider } from "./credentialProvider.js";

/**
 * Represents the current authentication state for display in the UI.
 */
export type AuthState = "authenticated" | "notAuthenticated" | "error";

/**
 * Detailed authentication status with method and error information.
 */
export type AuthStatus =
  | { state: "authenticated"; method: "entraId" | "apiKey" }
  | { state: "notAuthenticated"; reason?: string }
  | { state: "error"; message: string };

/**
 * Probes the current authentication status by attempting to validate credentials.
 * 
 * - For Entra ID: attempts to obtain a token via DefaultAzureCredential
 * - For API Key: checks if a key exists in SecretStorage
 * - Returns a status object; never throws
 */
export async function checkAuthStatus(
  config: ExtensionConfig,
  secrets: vscode.SecretStorage,
): Promise<AuthStatus> {
  // Check basic config validity first
  if (!config.endpoint) {
    return {
      state: "notAuthenticated",
      reason: "No endpoint configured",
    };
  }

  if (config.authMethod === "entraId") {
    try {
      const provider = await createCredentialProvider(config, secrets);
      await provider.getToken();
      return { state: "authenticated", method: "entraId" };
    } catch (error) {
      return {
        state: "error",
        message: error instanceof Error ? error.message : "Entra ID auth failed",
      };
    }
  }

  // apiKey mode — check if key exists
  try {
    const apiKey = await secrets.get("forge.copilot.apiKey");
    if (apiKey && apiKey.trim().length > 0) {
      return { state: "authenticated", method: "apiKey" };
    }

    return { state: "notAuthenticated", reason: "No API key set" };
  } catch (error) {
    return {
      state: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to read API key from secret storage",
    };
  }
}
