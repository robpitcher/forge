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
  model: "gpt-4.1",
  wireApi: "completions",
  cliPath: "",
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
      const session = await getOrCreateSession("conv-1", validConfig);

      expect(session).toBeDefined();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        model: "gpt-4.1",
        provider: {
          type: "azure",
          baseUrl: validConfig.endpoint,
          apiKey: validConfig.apiKey,
          wireApi: validConfig.wireApi,
          azure: { apiVersion: "2024-10-21" },
        },
        streaming: true,
        availableTools: [],
      });
    });

    it("reuses existing session for same conversationId", async () => {
      const session1 = await getOrCreateSession("conv-1", validConfig);
      const session2 = await getOrCreateSession("conv-1", validConfig);

      expect(session1).toBe(session2);
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("creates separate sessions for different conversationIds", async () => {
      await getOrCreateSession("conv-1", validConfig);
      await getOrCreateSession("conv-2", validConfig);

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  describe("removeSession", () => {
    it("removes a session so next call creates a new one", async () => {
      await getOrCreateSession("conv-1", validConfig);
      removeSession("conv-1");
      await getOrCreateSession("conv-1", validConfig);

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  describe("stopClient", () => {
    it("stops client and clears sessions", async () => {
      await getOrCreateSession("conv-1", validConfig);

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
      await getOrCreateSession("conv-1", validConfig);
      await stopClient();

      // Re-setup mock for new client
      const newMockSession = createMockSession();
      const newMockClient = createMockClient(newMockSession);
      setMockClient(newMockClient);

      await getOrCreateSession("conv-1", validConfig);
      expect(newMockClient.createSession).toHaveBeenCalledOnce();
    });
  });
});
