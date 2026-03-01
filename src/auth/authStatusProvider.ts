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
  | { state: "authenticated"; method: "entraId" | "apiKey"; account?: string }
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
      const token = await provider.getToken();
      const account = decodeJwtPayload(token);
      return { state: "authenticated", method: "entraId", account };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);

      if (isNotLoggedInError(msg)) {
        return {
          state: "notAuthenticated",
          reason: "Sign in with Azure CLI to use Entra ID authentication",
        };
      }

      return {
        state: "error",
        message: "Entra ID configuration error — check Azure CLI setup",
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

const NOT_LOGGED_IN_PATTERNS: RegExp[] = [
  /credentialunavailableerror/i,
  /credential[\s_-]*unavailable/i,
  /no\s+(default\s+)?credential/i,
  /az\s*login/i,
  /please run .?az login/i,
  /AADSTS\d+/,
  /interactive[\s\S]*authentication/i,
  /failed to retrieve[\s\S]*token/i,
];

/** Distinguishes "not logged in" from genuine config/network errors. */
function isNotLoggedInError(message: string): boolean {
  return NOT_LOGGED_IN_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Decodes JWT payload to extract user identity.
 * Returns the user's account name (upn, preferred_username, or name claim).
 * Returns undefined if token cannot be decoded or no identity claims found.
 */
function decodeJwtPayload(token: string): string | undefined {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    const claims = JSON.parse(payload) as Record<string, unknown>;
    
    // Try claims in order of preference
    const upn = typeof claims["upn"] === "string" ? claims["upn"] : undefined;
    if (upn) return upn;
    
    const preferred = typeof claims["preferred_username"] === "string" ? claims["preferred_username"] : undefined;
    if (preferred) return preferred;
    
    const name = typeof claims["name"] === "string" ? claims["name"] : undefined;
    if (name) return name;
    
    return undefined;
  } catch {
    return undefined;
  }
}
