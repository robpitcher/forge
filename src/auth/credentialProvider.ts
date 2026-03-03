import type * as vscode from "vscode";
import type { ExtensionConfig } from "../configuration.js";
import { execFileSync } from "child_process";

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
 * 
 * Auto-recovery: If getToken fails with "No subscription found", attempts to auto-select
 * the first enabled Azure subscription and retries once.
 */
export class EntraIdCredentialProvider implements CredentialProvider {
  private credential: { getToken(scope: string): Promise<{ token: string }> };
  private hasAttemptedRecovery = false;

  constructor(credential: {
    getToken(scope: string): Promise<{ token: string }>;
  }) {
    this.credential = credential;
  }

  async getToken(): Promise<string> {
    try {
      const result = await this.credential.getToken(
        AZURE_COGNITIVE_SERVICES_SCOPE,
      );
      return result.token;
    } catch (error) {
      // Auto-recovery: if the error is "No subscription found" and we haven't tried recovery yet
      if (!this.hasAttemptedRecovery && this.isNoSubscriptionError(error)) {
        this.hasAttemptedRecovery = true;
        
        try {
          const recovered = this.autoSelectSubscription();
          
          if (!recovered) {
            throw new Error(
              `Azure authentication failed. Multiple Azure subscriptions found. Run 'az account set --subscription <id>' to select one.`,
            );
          }
          
          // Retry getToken after setting subscription
          const result = await this.credential.getToken(
            AZURE_COGNITIVE_SERVICES_SCOPE,
          );
          return result.token;
        } catch (retryError) {
          // If autoSelectSubscription returned false (thrown above) or retry fails
          if (retryError instanceof Error && retryError.message.includes("Multiple Azure subscriptions")) {
            throw retryError;
          }
          // If retry fails, throw the original error with better message
          throw new Error(
            `Azure authentication failed. Run 'az account set --subscription <id>' to select a subscription.`,
          );
        }
      }
      
      // Not a subscription error or recovery already attempted — rethrow
      throw error;
    }
  }

  private isNoSubscriptionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("No subscription found") ||
      message.includes("az account set")
    );
  }

  private autoSelectSubscription(): boolean {
    try {
      // Get list of subscriptions
      const output = execFileSync("az", ["account", "list", "--output", "json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10000,
      });
      
      const subscriptions = JSON.parse(output) as Array<{
        id: string;
        name: string;
        state: string;
        isDefault: boolean;
      }>;
      
      const enabledSubs = subscriptions.filter((sub) => sub.state === "Enabled");
      
      if (enabledSubs.length === 0) {
        return false;
      }
      
      if (enabledSubs.length > 1) {
        // Multiple subscriptions — do not auto-select to avoid mutating global CLI state
        return false;
      }
      
      // Exactly one enabled subscription — safe to auto-select
      const enabledSub = enabledSubs[0];
      execFileSync("az", ["account", "set", "--subscription", enabledSub.id], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10000,
      });
      
      console.warn(
        `[forge] No Azure subscription set. Auto-selecting: ${enabledSub.name} (${enabledSub.id})`,
      );
      return true;
    } catch (execError) {
      // If az cli commands fail, we'll let the retry fail naturally
      console.warn("[forge] Failed to auto-select Azure subscription:", execError);
      throw execError;
    }
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
