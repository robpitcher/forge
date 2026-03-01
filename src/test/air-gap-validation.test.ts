import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  constructorSpy,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  getOrCreateClient,
  getOrCreateSession,
  stopClient,
} from "../copilotService.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

const validAzureConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-azure-key-123",
  authMethod: "apiKey",
  model: "gpt-4.1",
  wireApi: "completions",
  cliPath: "",
  toolShell: true,
  toolRead: true,
  toolWrite: true,
  toolUrl: false,
  toolMcp: true,
};

describe("Air-gap validation (SC2, SC3)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    constructorSpy.mockClear();
    
    // Clear any GITHUB_TOKEN env var to simulate air-gap
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("No GitHub token dependency", () => {
    it("creates client without requiring GITHUB_TOKEN env var", async () => {
      expect(process.env.GITHUB_TOKEN).toBeUndefined();

      const client = await getOrCreateClient(validAzureConfig);

      expect(client).toBeDefined();
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("creates session without requiring GITHUB_TOKEN env var", async () => {
      expect(process.env.GITHUB_TOKEN).toBeUndefined();

      const session = await getOrCreateSession("agv-no-token", validAzureConfig, "test-azure-key-123");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("does not pass GitHub credentials to CopilotClient constructor", async () => {
      await getOrCreateClient(validAzureConfig);

      const ctorCall = constructorSpy.mock.calls[0][0] as Record<string, unknown> | undefined;
      
      // Constructor should only have cliPath (if set), never GitHub token or auth
      if (ctorCall) {
        expect(ctorCall).not.toHaveProperty("token");
        expect(ctorCall).not.toHaveProperty("githubToken");
        expect(ctorCall).not.toHaveProperty("auth");
        expect(ctorCall).not.toHaveProperty("github");
      }
    });
  });

  describe("No GitHub API in provider config", () => {
    it("uses only user-configured Azure endpoint, never github.com", async () => {
      await getOrCreateSession("agv-endpoint", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { baseUrl: string };
      };
      const baseUrl = sessionConfig.provider.baseUrl;

      expect(baseUrl).toBe(validAzureConfig.endpoint);
      expect(baseUrl).not.toContain("github.com");
      expect(baseUrl).not.toContain("api.github.com");
    });

    it("configures provider type as 'azure' for Azure endpoints", async () => {
      await getOrCreateSession("agv-azure-type", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { type: string };
      };

      expect(sessionConfig.provider.type).toBe("azure");
    });

    it("configures Azure-specific API version for Azure endpoints", async () => {
      await getOrCreateSession("agv-azure-version", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { azure?: { apiVersion: string } };
      };

      expect(sessionConfig.provider.azure).toBeDefined();
      expect(sessionConfig.provider.azure?.apiVersion).toBe("2024-10-21");
    });

    it("uses apiKey from user settings, not GitHub token", async () => {
      await getOrCreateSession("agv-apikey", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { apiKey: string };
      };

      expect(sessionConfig.provider.apiKey).toBe(validAzureConfig.apiKey);
    });
  });

  describe("Provider isolation (BYOK)", () => {
    it("creates self-contained provider config with only user settings", async () => {
      await getOrCreateSession("agv-self-contained", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: Record<string, unknown>;
      };
      const provider = sessionConfig.provider;

      // Provider should only contain: type, baseUrl, apiKey, wireApi, azure
      const allowedKeys = ["type", "baseUrl", "apiKey", "wireApi", "azure"];
      const providerKeys = Object.keys(provider);

      for (const key of providerKeys) {
        expect(allowedKeys).toContain(key);
      }

      // No GitHub-specific keys
      expect(provider).not.toHaveProperty("github");
      expect(provider).not.toHaveProperty("token");
      expect(provider).not.toHaveProperty("auth");
    });

    it("derives all provider values from ExtensionConfig", async () => {
      const customConfig: ExtensionConfig = {
        endpoint: "https://custom.azure.com/v2/",
        apiKey: "custom-key-456",
        authMethod: "apiKey",
        model: "gpt-4o",
        wireApi: "responses",
        cliPath: "/custom/cli",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      await getOrCreateSession("agv-custom-cfg", customConfig, "custom-key-456");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        model: string;
        provider: { baseUrl: string; apiKey: string; wireApi: string };
      };

      expect(sessionConfig.model).toBe(customConfig.model);
      expect(sessionConfig.provider.baseUrl).toBe(customConfig.endpoint);
      expect(sessionConfig.provider.apiKey).toBe(customConfig.apiKey);
      expect(sessionConfig.provider.wireApi).toBe(customConfig.wireApi);
    });

    it("does not require internet access except to configured endpoint", async () => {
      // This test verifies that the provider config points only to the user endpoint
      // In a real air-gap environment, only this endpoint would be accessible
      await getOrCreateSession("agv-internet", validAzureConfig, "test-azure-key-123");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { baseUrl: string };
      };

      // All API calls should go to this single endpoint
      expect(sessionConfig.provider.baseUrl).toBe(validAzureConfig.endpoint);
      
      // Verify it's an Azure domain (not public GitHub)
      expect(sessionConfig.provider.baseUrl).toContain(".azure.com");
    });
  });

  describe("Session creation without GitHub auth", () => {
    it("creates session with only Azure config, no GitHub credentials", async () => {
      expect(process.env.GITHUB_TOKEN).toBeUndefined();

      const session = await getOrCreateSession("agv-no-github", validAzureConfig, "test-azure-key-123");

      expect(session).toBeDefined();
      
      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as Record<string, unknown>;
      
      // Session config should not reference GitHub anywhere
      const configStr = JSON.stringify(sessionConfig);
      expect(configStr).not.toContain("github");
      expect(configStr).not.toContain("GITHUB");
    });

    it("session works with GITHUB_TOKEN explicitly unset", async () => {
      delete process.env.GITHUB_TOKEN;
      
      const session = await getOrCreateSession("agv-unset-token", validAzureConfig, "test-azure-key-123");

      expect(session).toBeDefined();
      
      // Verify session can send messages
      const result = await session.send({ prompt: "test" });
      expect(result).toBe("msg-1"); // Default mock value
    });

    it("supports non-Azure OpenAI-compatible endpoints without GitHub", async () => {
      const genericConfig: ExtensionConfig = {
        endpoint: "https://private.llm.internal/v1/",
        apiKey: "private-key-789",
        authMethod: "apiKey",
        model: "custom-model",
        wireApi: "completions",
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      await getOrCreateSession("agv-generic-endpoint", genericConfig, "private-key-789");

      const callIdx = mockClient.createSession.mock.calls.length - 1;
      const sessionConfig = mockClient.createSession.mock.calls[callIdx][0] as {
        provider: { type: string; baseUrl: string };
      };

      // Should use generic "openai" type for non-Azure endpoints
      expect(sessionConfig.provider.type).toBe("openai");
      expect(sessionConfig.provider.baseUrl).toBe(genericConfig.endpoint);
      expect(sessionConfig.provider.baseUrl).not.toContain("github.com");
    });
  });

  describe("Zero external dependencies", () => {
    it("creates multiple sessions without any GitHub API calls", async () => {
      expect(process.env.GITHUB_TOKEN).toBeUndefined();

      // Create multiple sessions across different conversations
      await getOrCreateSession("agv-multi-1", validAzureConfig, "test-azure-key-123");
      await getOrCreateSession("agv-multi-2", validAzureConfig, "test-azure-key-123");
      await getOrCreateSession("agv-multi-3", validAzureConfig, "test-azure-key-123");

      expect(mockClient.createSession).toHaveBeenCalledTimes(3);

      // All sessions should point to same Azure endpoint
      for (let i = 0; i < 3; i++) {
        const sessionConfig = mockClient.createSession.mock.calls[i][0] as {
          provider: { baseUrl: string };
        };
        expect(sessionConfig.provider.baseUrl).toBe(validAzureConfig.endpoint);
      }
    });

    it("client creation does not require network access", async () => {
      // Client should be created locally without reaching out to GitHub
      const client = await getOrCreateClient(validAzureConfig);

      expect(client).toBeDefined();
      
      // Constructor should only have optional cliPath
      const ctorCall = constructorSpy.mock.calls[0][0] as Record<string, unknown> | undefined;
      
      if (ctorCall) {
        const keys = Object.keys(ctorCall);
        // Only cliPath is allowed, and it should be empty or a local path
        for (const key of keys) {
          expect(key).toBe("cliPath");
          if (ctorCall[key]) {
            expect(typeof ctorCall[key]).toBe("string");
          }
        }
      } else {
        // No options passed means fully local operation
        expect(ctorCall).toBeUndefined();
      }
    });
  });

  describe("CLI path configuration", () => {
    it("respects custom CLI path without requiring GitHub auth", async () => {
      const configWithCli: ExtensionConfig = {
        ...validAzureConfig,
        cliPath: "/opt/copilot-cli/bin/copilot",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      await getOrCreateClient(configWithCli);

      const ctorCall = constructorSpy.mock.calls[0][0] as Record<string, unknown>;
      
      expect(ctorCall).toBeDefined();
      expect(ctorCall.cliPath).toBe("/opt/copilot-cli/bin/copilot");
      
      // Still no GitHub-related config
      expect(ctorCall).not.toHaveProperty("token");
      expect(ctorCall).not.toHaveProperty("github");
    });

    it("works with empty cliPath (uses default from PATH)", async () => {
      const configNoCli: ExtensionConfig = {
        ...validAzureConfig,
        cliPath: "",
        toolShell: true,
        toolRead: true,
        toolWrite: true,
        toolUrl: false,
        toolMcp: true,
      };

      await getOrCreateClient(configNoCli);

      // Should either pass empty object or undefined options
      const ctorCall = constructorSpy.mock.calls[0][0] as Record<string, unknown> | undefined;
      
      if (ctorCall) {
        expect(Object.keys(ctorCall)).toHaveLength(0);
      }
    });
  });
});
