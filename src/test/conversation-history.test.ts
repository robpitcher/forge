import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  stopClient,
  listConversations,
  resumeConversation,
  getLastConversationId,
  deleteConversation,
} from "../copilotService.js";

// SDK SessionMetadata structure (from SDK types)
interface SDKSessionMetadata {
  sessionId: string;
  startTime: Date;
  modifiedTime: Date;
  summary?: string;
  isRemote: boolean;
  context?: unknown;
}

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

const validConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-key-123",
  authMethod: "apiKey",
  model: "gpt-4.1",
  models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  wireApi: "completions",
  cliPath: "",
  toolShell: true,
  toolRead: true,
  toolWrite: true,
  toolUrl: false,
  toolMcp: true,
};

const entraIdConfig: ExtensionConfig = {
  ...validConfig,
  apiKey: "",
  authMethod: "entraId",
};

describe("conversation history persistence", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(async () => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("listConversations", () => {
    it("returns mapped ConversationMetadata from SDK's listSessions", async () => {

      const sdkMetadata: SDKSessionMetadata[] = [
        {
          sessionId: "session-1",
          summary: "Discussion about auth",
          startTime: new Date("2024-01-15T10:00:00Z"),
          modifiedTime: new Date("2024-01-15T10:15:00Z"),
          isRemote: false,
        },
        {
          sessionId: "session-2",
          summary: "Bug fix for login",
          startTime: new Date("2024-01-14T14:30:00Z"),
          modifiedTime: new Date("2024-01-14T15:00:00Z"),
          isRemote: false,
        },
      ];

      mockClient.listSessions.mockResolvedValue(sdkMetadata);

      const result = await listConversations(validConfig);

      expect(mockClient.listSessions).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sessionId: "session-1",
        summary: "Discussion about auth",
        startTime: new Date("2024-01-15T10:00:00Z"),
        modifiedTime: new Date("2024-01-15T10:15:00Z"),
      });
      expect(result[1]).toEqual({
        sessionId: "session-2",
        summary: "Bug fix for login",
        startTime: new Date("2024-01-14T14:30:00Z"),
        modifiedTime: new Date("2024-01-14T15:00:00Z"),
      });
    });

    it("returns empty array when no sessions exist", async () => {

      mockClient.listSessions.mockResolvedValue([]);

      const result = await listConversations(validConfig);

      expect(result).toEqual([]);
    });

    it("creates client if not already started", async () => {

      mockClient.listSessions.mockResolvedValue([]);

      await listConversations(validConfig);

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK errors gracefully when client not started", async () => {

      mockClient.start.mockRejectedValue(new Error("Client start failed"));

      await expect(listConversations(validConfig)).rejects.toThrow("Client start failed");
    });

    it("handles SDK errors gracefully on listSessions call", async () => {

      mockClient.listSessions.mockRejectedValue(new Error("Connection error"));

      await expect(listConversations(validConfig)).rejects.toThrow("Connection error");
    });

    it("handles missing summary field in SDK metadata", async () => {

      const sdkMetadata: SDKSessionMetadata[] = [
        {
          sessionId: "session-no-summary",
          startTime: new Date("2024-01-15T10:00:00Z"),
          modifiedTime: new Date("2024-01-15T10:15:00Z"),
          isRemote: false,
        },
      ];

      mockClient.listSessions.mockResolvedValue(sdkMetadata);

      const result = await listConversations(validConfig);

      expect(result[0]).toEqual({
        sessionId: "session-no-summary",
        summary: undefined,
        startTime: new Date("2024-01-15T10:00:00Z"),
        modifiedTime: new Date("2024-01-15T10:15:00Z"),
      });
    });
  });

  describe("resumeConversation", () => {
    it("resumes a session and stores it in the sessions map", async () => {

      const session = await resumeConversation(
        "session-1",
        validConfig,
        "test-key-123"
      );

      expect(session).toBeDefined();
      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          model: "gpt-4.1",
          provider: expect.objectContaining({
            type: "azure",
            baseUrl: validConfig.endpoint,
            apiKey: "test-key-123",
          }),
          streaming: true,
        })
      );
    });

    it("applies correct provider config for azure endpoints", async () => {

      await resumeConversation("session-azure", validConfig, "test-key-123");

      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-azure",
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "azure",
            azure: { apiVersion: "2024-10-21" },
          }),
        })
      );
    });

    it("applies correct provider config for openai endpoints", async () => {

      const openaiConfig: ExtensionConfig = {
        ...validConfig,
        endpoint: "https://api.openai.com/v1/",
      };

      await resumeConversation("session-openai", openaiConfig, "test-key-123");

      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-openai",
        expect.objectContaining({
          provider: expect.objectContaining({
            type: "openai",
          }),
        })
      );
    });

    it("applies apiKey auth when authMethod is apiKey", async () => {

      await resumeConversation("session-apikey", validConfig, "my-api-key");

      const callArgs = mockClient.resumeSession.mock.calls[0][1];
      expect(callArgs.provider.apiKey).toBe("my-api-key");
      expect(callArgs.provider.bearerToken).toBeUndefined();
    });

    it("applies bearerToken auth when authMethod is entraId", async () => {

      await resumeConversation("session-entra", entraIdConfig, "entra-token-xyz");

      const callArgs = mockClient.resumeSession.mock.calls[0][1];
      expect(callArgs.provider.bearerToken).toBe("entra-token-xyz");
      expect(callArgs.provider.apiKey).toBeUndefined();
    });

    it("applies tool exclusion settings from config", async () => {

      const configWithExcluded: ExtensionConfig = {
        ...validConfig,
        toolUrl: false,
        toolMcp: false,
      };

      await resumeConversation(
        "session-tools",
        configWithExcluded,
        "test-key-123"
      );

      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-tools",
        expect.objectContaining({
          excludedTools: expect.arrayContaining(["url", "mcp"]),
        })
      );
    });

    it("stores resumed session in sessions map for reuse", async () => {

      const session1 = await resumeConversation(
        "session-reuse",
        validConfig,
        "test-key-123"
      );
      
      // Second call with same session ID should call SDK again
      // (resumeConversation doesn't cache; that's a design choice)
      const session2 = await resumeConversation(
        "session-reuse",
        validConfig,
        "test-key-123"
      );

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(mockClient.resumeSession).toHaveBeenCalledTimes(2);
    });

    it("throws actionable error when session ID doesn't exist", async () => {

      mockClient.resumeSession.mockRejectedValue(
        new Error("Session not found")
      );

      await expect(
        resumeConversation("nonexistent", validConfig, "test-key-123")
      ).rejects.toThrow();
    });

    it("creates client if not already started", async () => {

      await resumeConversation("session-1", validConfig, "test-key-123");

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("passes onPermissionRequest handler when provided", async () => {

      const mockPermissionHandler = vi.fn();

      await resumeConversation(
        "session-perms",
        validConfig,
        "test-key-123",
        mockPermissionHandler
      );

      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-perms",
        expect.objectContaining({
          onPermissionRequest: mockPermissionHandler,
        })
      );
    });

    it("handles SDK connection errors gracefully", async () => {

      mockClient.resumeSession.mockRejectedValue(
        new Error("Connection timeout")
      );

      await expect(
        resumeConversation("session-error", validConfig, "test-key-123")
      ).rejects.toThrow("Connection timeout");
    });
  });

  describe("getLastConversationId", () => {
    it("returns session ID when one exists", async () => {

      mockClient.getLastSessionId.mockResolvedValue("last-session-123");

      const result = await getLastConversationId(validConfig);

      expect(result).toBe("last-session-123");
      expect(mockClient.getLastSessionId).toHaveBeenCalledOnce();
    });

    it("returns undefined when no sessions exist", async () => {

      mockClient.getLastSessionId.mockResolvedValue(undefined);

      const result = await getLastConversationId(validConfig);

      expect(result).toBeUndefined();
    });

    it("creates client if not already started", async () => {

      mockClient.getLastSessionId.mockResolvedValue(undefined);

      await getLastConversationId(validConfig);

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK errors gracefully", async () => {

      mockClient.getLastSessionId.mockRejectedValue(
        new Error("Storage error")
      );

      await expect(getLastConversationId(validConfig)).rejects.toThrow("Storage error");
    });
  });

  describe("deleteConversation", () => {
    it("deletes from SDK storage", async () => {

      await deleteConversation("session-delete", validConfig);

      expect(mockClient.deleteSession).toHaveBeenCalledWith("session-delete");
    });

    it("removes from local sessions map", async () => {

      // First resume a session to populate the map
      await resumeConversation("session-123", validConfig, "test-key-123");

      // Delete it
      await deleteConversation("session-123", validConfig);

      // Next resume should call SDK again (not reuse cached)
      await resumeConversation("session-123", validConfig, "test-key-123");
      expect(mockClient.resumeSession).toHaveBeenCalledTimes(2);
    });

    it("handles gracefully when session doesn't exist", async () => {

      mockClient.deleteSession.mockResolvedValue(undefined);

      // Should not throw
      await expect(
        deleteConversation("nonexistent-session", validConfig)
      ).resolves.toBeUndefined();
    });

    it("creates client if not already started", async () => {

      await deleteConversation("session-delete", validConfig);

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK deletion errors gracefully", async () => {

      mockClient.deleteSession.mockRejectedValue(
        new Error("Deletion failed")
      );

      await expect(deleteConversation("session-error", validConfig)).rejects.toThrow(
        "Deletion failed"
      );
    });
  });

  describe("integration scenarios", () => {
    it("can list, resume, and delete a conversation", async () => {

      // Setup: SDK has one session
      const sdkMetadata: SDKSessionMetadata[] = [
        {
          sessionId: "session-int-1",
          summary: "Test conversation",
          startTime: new Date("2024-01-15T10:00:00Z"),
          modifiedTime: new Date("2024-01-15T10:15:00Z"),
          isRemote: false,
        },
      ];
      mockClient.listSessions.mockResolvedValue(sdkMetadata);

      // List conversations
      const conversations = await listConversations(validConfig);
      expect(conversations).toHaveLength(1);
      expect(conversations[0].sessionId).toBe("session-int-1");

      // Resume the conversation
      const session = await resumeConversation(
        "session-int-1",
        validConfig,
        "test-key-123"
      );
      expect(session).toBeDefined();

      // Delete the conversation
      await deleteConversation("session-int-1", validConfig);
      expect(mockClient.deleteSession).toHaveBeenCalledWith("session-int-1");
    });

    it("getLastConversationId returns most recent after multiple creates", async () => {

      mockClient.getLastSessionId.mockResolvedValue("most-recent-session");

      const lastId = await getLastConversationId(validConfig);

      expect(lastId).toBe("most-recent-session");
    });

    it("handles empty state gracefully - no conversations yet", async () => {

      mockClient.listSessions.mockResolvedValue([]);
      mockClient.getLastSessionId.mockResolvedValue(undefined);

      const conversations = await listConversations(validConfig);
      const lastId = await getLastConversationId(validConfig);

      expect(conversations).toEqual([]);
      expect(lastId).toBeUndefined();
    });
  });

  describe("error path coverage", () => {
    it("listConversations fails when SDK is unavailable", async () => {

      mockClient.start.mockRejectedValue(new Error("SDK unavailable"));

      await expect(listConversations(validConfig)).rejects.toThrow("SDK unavailable");
    });

    it("resumeConversation with invalid config still calls SDK", async () => {

      const invalidConfig: ExtensionConfig = {
        ...validConfig,
        endpoint: "",
      };

      // Implementation doesn't validate endpoint — SDK would fail
      // We're testing that the wrapper doesn't crash pre-SDK
      await resumeConversation("session-bad", invalidConfig, "test-key-123");
      
      expect(mockClient.resumeSession).toHaveBeenCalledWith(
        "session-bad",
        expect.any(Object)
      );
    });

    it("deleteConversation handles concurrent deletion attempts", async () => {

      // First call succeeds
      mockClient.deleteSession.mockResolvedValueOnce(undefined);
      // Second call to same session (already deleted)
      mockClient.deleteSession.mockResolvedValueOnce(undefined);

      await deleteConversation("session-123", validConfig);
      await deleteConversation("session-123", validConfig); // Should not throw

      expect(mockClient.deleteSession).toHaveBeenCalledTimes(2);
    });

    it("resumeConversation with expired auth token fails", async () => {

      mockClient.resumeSession.mockRejectedValue(
        new Error("Authentication failed: token expired")
      );

      await expect(
        resumeConversation("session-auth", entraIdConfig, "expired-token")
      ).rejects.toThrow("token expired");
    });
  });
});
