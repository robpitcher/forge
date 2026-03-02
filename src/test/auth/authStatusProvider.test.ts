import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionConfig } from "../../configuration.js";

// Mock @azure/identity before importing — createCredentialProvider uses dynamic import()
const mockGetToken = vi.fn();

vi.mock("@azure/identity", () => {
  return {
    DefaultAzureCredential: class MockDefaultAzureCredential {
      getToken = mockGetToken;
    },
  };
});

// Mock vscode SecretStorage
function createMockSecrets(apiKey?: string) {
  return {
    get: vi.fn().mockImplementation((key: string) =>
      key === "forge.copilot.apiKey"
        ? Promise.resolve(apiKey)
        : Promise.resolve(undefined),
    ),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  } as unknown as import("vscode").SecretStorage;
}

import { checkAuthStatus } from "../../auth/authStatusProvider.js";

describe("checkAuthStatus", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
  });

  describe("configuration validation", () => {
    it("returns notAuthenticated when endpoint is empty", async () => {
      const config: ExtensionConfig = {
        endpoint: "",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "No endpoint configured",
      });
    });

    it("returns notAuthenticated when endpoint is undefined", async () => {
      const config = {
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      } as unknown as ExtensionConfig;

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "No endpoint configured",
      });
    });
  });

  describe("Entra ID authentication", () => {
    it("returns authenticated with method 'entraId' when token succeeds", async () => {
      mockGetToken.mockResolvedValue({
        token: "valid-entra-token",
        expiresOnTimestamp: Date.now() + 3600000,
      });

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "authenticated",
        method: "entraId",
      });
    });

    it("returns notAuthenticated when Entra ID fails with AggregateAuthenticationError (no credential)", async () => {
      mockGetToken.mockRejectedValue(
        new Error(
          "AggregateAuthenticationError: No credential in the chain provided a token",
        ),
      );

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "Sign in with Azure CLI to use Entra ID authentication",
      });
    });

    it("returns notAuthenticated when Entra ID fails with CredentialUnavailableError", async () => {
      const credError = new Error(
        "CredentialUnavailableError: Azure CLI not found",
      );
      credError.name = "CredentialUnavailableError";
      mockGetToken.mockRejectedValue(credError);

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "Sign in with Azure CLI to use Entra ID authentication",
      });
    });

    it("returns notAuthenticated when error suggests az login is needed", async () => {
      mockGetToken.mockRejectedValue(
        new Error("Please run 'az login' to authenticate"),
      );

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "Sign in with Azure CLI to use Entra ID authentication",
      });
    });

    it("returns notAuthenticated when error contains AADSTS code", async () => {
      mockGetToken.mockRejectedValue(
        new Error("AADSTS70011: The provided request must include an input_token"),
      );

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "Sign in with Azure CLI to use Entra ID authentication",
      });
    });

    it("returns error with friendly message when Entra ID fails with non-Error", async () => {
      mockGetToken.mockRejectedValue("something went wrong");

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "error",
        message: "Entra ID configuration error — check Azure CLI setup",
      });
    });
  });

  describe("API key authentication", () => {
    it("returns authenticated with method 'apiKey' when key exists", async () => {
      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "apiKey",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(
        config,
        createMockSecrets("stored-api-key-123"),
      );

      expect(status).toEqual({
        state: "authenticated",
        method: "apiKey",
      });
    });

    it("returns notAuthenticated when API key is missing", async () => {
      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "apiKey",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "No API key set",
      });
    });

    it("returns notAuthenticated when API key is empty string", async () => {
      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "apiKey",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets(""));

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "No API key set",
      });
    });

    it("returns notAuthenticated when API key is whitespace only", async () => {
      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "apiKey",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets("   \t\n  "));

      expect(status).toEqual({
        state: "notAuthenticated",
        reason: "No API key set",
      });
    });
  });

  describe("error handling", () => {
    it("never throws — always returns a status object", async () => {
      // Test multiple failure scenarios to ensure none throw
      const configs: ExtensionConfig[] = [
        // Missing endpoint
        {
          endpoint: "",
          apiKey: "",
          authMethod: "entraId",
          models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
          wireApi: "completions",
          cliPath: "",
          toolShell: true,
          toolRead: true,
          toolWrite: true,
          toolUrl: false,
          toolMcp: true,
        },
        // Missing API key
        {
          endpoint: "https://myresource.openai.azure.com/openai/v1/",
          apiKey: "",
          authMethod: "apiKey",
          models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
          wireApi: "completions",
          cliPath: "",
          toolShell: true,
          toolRead: true,
          toolWrite: true,
          toolUrl: false,
          toolMcp: true,
        },
      ];

      for (const config of configs) {
        const statusPromise = checkAuthStatus(config, createMockSecrets());
        // Should not throw
        await expect(statusPromise).resolves.toBeDefined();

        const status = await statusPromise;
        // Should have a valid state
        expect(status.state).toMatch(/^(authenticated|notAuthenticated|error)$/);
      }
    });

    it("handles Entra ID failures gracefully without throwing", async () => {
      mockGetToken.mockRejectedValue(new Error("Network timeout"));

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const statusPromise = checkAuthStatus(config, createMockSecrets());

      // Must not throw
      await expect(statusPromise).resolves.toBeDefined();

      const status = await statusPromise;
      expect(status.state).toBe("error");
      if (status.state === "error") {
        expect(status.message).toBe("Entra ID configuration error — check Azure CLI setup");
      }
    });
  });

  describe("status object type safety", () => {
    it("authenticated status has method field, not reason or message", async () => {
      mockGetToken.mockResolvedValue({
        token: "token",
        expiresOnTimestamp: Date.now() + 3600000,
      });

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status.state).toBe("authenticated");
      if (status.state === "authenticated") {
        expect(status.method).toMatch(/^(entraId|apiKey)$/);
        expect(status).not.toHaveProperty("reason");
        expect(status).not.toHaveProperty("message");
      }
    });

    it("notAuthenticated status may have reason, not method or message", async () => {
      const config: ExtensionConfig = {
        endpoint: "",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status.state).toBe("notAuthenticated");
      if (status.state === "notAuthenticated") {
        expect(status.reason).toBeDefined();
        expect(status).not.toHaveProperty("method");
        expect(status).not.toHaveProperty("message");
      }
    });

    it("error status has message, not method or reason", async () => {
      mockGetToken.mockRejectedValue(new Error("Some network failure"));

      const config: ExtensionConfig = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "",
        authMethod: "entraId",
        models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      const status = await checkAuthStatus(config, createMockSecrets());

      expect(status.state).toBe("error");
      if (status.state === "error") {
        expect(status.message).toBeDefined();
        expect(status).not.toHaveProperty("method");
        expect(status).not.toHaveProperty("reason");
      }
    });
  });
});
