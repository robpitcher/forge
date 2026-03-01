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
  removeSession,
  stopClient,
} from "../copilotService.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

const validConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-key-123",
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

// Configs for #27 auth method tests
const apiKeyConfig: ExtensionConfig = {
  ...validConfig,
  authMethod: "apiKey",
};

const entraIdConfig: ExtensionConfig = {
  ...validConfig,
  apiKey: "",
  authMethod: "entraId",
};

describe("copilotService", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    constructorSpy.mockClear();
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("getOrCreateClient", () => {
    it("creates a client and starts it", async () => {
      const client = await getOrCreateClient(validConfig);

      expect(client).toBeDefined();
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("reuses existing client on second call", async () => {
      const client1 = await getOrCreateClient(validConfig);
      const client2 = await getOrCreateClient(validConfig);

      expect(client1).toBe(client2);
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("passes cliPath when configured", async () => {
      const configWithCli = { ...validConfig, cliPath: "/custom/path/copilot" };

      await getOrCreateClient(configWithCli);

      expect(constructorSpy).toHaveBeenCalledWith({
        cliPath: "/custom/path/copilot",
      });
    });
  });

  describe("getOrCreateSession", () => {
    it("creates a session with correct config", async () => {
      const session = await getOrCreateSession("conv-1", validConfig, "test-key-123");

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        sessionId: "conv-1",
        model: "gpt-4.1",
        provider: {
          type: "azure",
          baseUrl: validConfig.endpoint,
          apiKey: "test-key-123",
          wireApi: validConfig.wireApi,
          azure: { apiVersion: "2024-10-21" },
        },
        streaming: true,
        excludedTools: ["url"],
      });
    });

    it("reuses existing session for same conversationId", async () => {
      const session1 = await getOrCreateSession("conv-1", validConfig, "test-key-123");
      const session2 = await getOrCreateSession("conv-1", validConfig, "test-key-123");

      expect(session1).toBe(session2);
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("creates separate sessions for different conversationIds", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123");
      await getOrCreateSession("conv-2", validConfig, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    // --- #27 auth method tests ---
    // These tests validate the authToken parameter and ProviderConfig wiring.
    // They will pass once Childs updates getOrCreateSession to accept authToken.

    it("passes bearerToken on ProviderConfig when authMethod is 'entraId'", async () => {
      await getOrCreateSession("conv-entra", entraIdConfig, "entra-bearer-token-xyz");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            bearerToken: "entra-bearer-token-xyz",
          }),
        }),
      );
      // Should NOT have apiKey set when using entraId
      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.provider.apiKey).toBeUndefined();
    });

    it("passes apiKey on ProviderConfig when authMethod is 'apiKey'", async () => {
      await getOrCreateSession("conv-apikey", apiKeyConfig, "my-api-key-secret");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            apiKey: "my-api-key-secret",
          }),
        }),
      );
      // Should NOT have bearerToken set when using apiKey
      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.provider.bearerToken).toBeUndefined();
    });

    it("sets azure provider config correctly with entraId auth", async () => {
      await getOrCreateSession("conv-entra-azure", entraIdConfig, "azure-token");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "azure",
            baseUrl: entraIdConfig.endpoint,
            bearerToken: "azure-token",
            azure: { apiVersion: "2024-10-21" },
          }),
        }),
      );
    });
    // --- #91 tool control tests ---

    it("passes excludedTools to createSession when configured", async () => {
      const configWithExcluded = { ...validConfig, excludedTools: ["url"] };
      await getOrCreateSession("conv-excluded", configWithExcluded, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedTools: ["url"],
        }),
      );
    });

    it("does not pass excludedTools when all tools enabled", async () => {
      const configAllEnabled: ExtensionConfig = {
        ...validConfig,
        toolUrl: true,
      };
      await getOrCreateSession("conv-none", configAllEnabled, "test-key-123");

      const callArgs = mockClient.createSession.mock.calls[0][0];
      expect(callArgs.excludedTools).toBeUndefined();
    });
  });

  describe("removeSession", () => {
    it("removes a session so next call creates a new one", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123");
      removeSession("conv-1");
      await getOrCreateSession("conv-1", validConfig, "test-key-123");

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  describe("stopClient", () => {
    it("stops client and clears sessions", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123");

      await stopClient();

      expect(mockClient.stop).toHaveBeenCalledOnce();

      // After stop, a new client should be created
      const newMockSession = createMockSession();
      const newMockClient = createMockClient(newMockSession);
      setMockClient(newMockClient);

      await getOrCreateClient(validConfig);
      expect(newMockClient.start).toHaveBeenCalledOnce();
    });

    it("clears sessions so they are recreated", async () => {
      await getOrCreateSession("conv-1", validConfig, "test-key-123");
      await stopClient();

      // Re-setup mock for new client
      const newMockSession = createMockSession();
      const newMockClient = createMockClient(newMockSession);
      setMockClient(newMockClient);

      await getOrCreateSession("conv-1", validConfig, "test-key-123");
      expect(newMockClient.createSession).toHaveBeenCalledOnce();
    });
  });
});
