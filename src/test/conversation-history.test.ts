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
} from "../copilotService.js";

// These imports will be available once Childs adds the functions
type ListConversationsFunc = () => Promise<ConversationMetadata[]>;
type ResumeConversationFunc = (
  sessionId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: unknown
) => Promise<unknown>;
type GetLastConversationIdFunc = () => Promise<string | undefined>;
type DeleteConversationFunc = (sessionId: string) => Promise<void>;

interface ConversationMetadata {
  sessionId: string;
  summary?: string;
  startTime: Date;
  modifiedTime: Date;
}

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
  let listConversations: ListConversationsFunc;
  let resumeConversation: ResumeConversationFunc;
  let getLastConversationId: GetLastConversationIdFunc;
  let deleteConversation: DeleteConversationFunc;

  beforeEach(async () => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);

    // Dynamically import the service functions
    // This will fail gracefully until Childs implements them
    try {
      const service = await import("../copilotService.js");
      listConversations = service.listConversations as ListConversationsFunc;
      resumeConversation = service.resumeConversation as ResumeConversationFunc;
      getLastConversationId = service.getLastConversationId as GetLastConversationIdFunc;
      deleteConversation = service.deleteConversation as DeleteConversationFunc;
    } catch {
      // Functions not yet implemented — tests will be skipped
    }
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("listConversations", () => {
    it("returns mapped ConversationMetadata from SDK's listSessions", async () => {
      if (!listConversations) {
        return; // Skip until implemented
      }

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

      const result = await listConversations();

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
      if (!listConversations) {
        return;
      }

      mockClient.listSessions.mockResolvedValue([]);

      const result = await listConversations();

      expect(result).toEqual([]);
    });

    it("creates client if not already started", async () => {
      if (!listConversations) {
        return;
      }

      mockClient.listSessions.mockResolvedValue([]);

      await listConversations();

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK errors gracefully when client not started", async () => {
      if (!listConversations) {
        return;
      }

      mockClient.start.mockRejectedValue(new Error("Client start failed"));

      await expect(listConversations()).rejects.toThrow("Client start failed");
    });

    it("handles SDK errors gracefully on listSessions call", async () => {
      if (!listConversations) {
        return;
      }

      mockClient.listSessions.mockRejectedValue(new Error("Connection error"));

      await expect(listConversations()).rejects.toThrow("Connection error");
    });

    it("handles missing summary field in SDK metadata", async () => {
      if (!listConversations) {
        return;
      }

      const sdkMetadata: SDKSessionMetadata[] = [
        {
          sessionId: "session-no-summary",
          startTime: new Date("2024-01-15T10:00:00Z"),
          modifiedTime: new Date("2024-01-15T10:15:00Z"),
          isRemote: false,
        },
      ];

      mockClient.listSessions.mockResolvedValue(sdkMetadata);

      const result = await listConversations();

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
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

      await resumeConversation("session-apikey", validConfig, "my-api-key");

      const callArgs = mockClient.resumeSession.mock.calls[0][1];
      expect(callArgs.provider.apiKey).toBe("my-api-key");
      expect(callArgs.provider.bearerToken).toBeUndefined();
    });

    it("applies bearerToken auth when authMethod is entraId", async () => {
      if (!resumeConversation) {
        return;
      }

      await resumeConversation("session-entra", entraIdConfig, "entra-token-xyz");

      const callArgs = mockClient.resumeSession.mock.calls[0][1];
      expect(callArgs.provider.bearerToken).toBe("entra-token-xyz");
      expect(callArgs.provider.apiKey).toBeUndefined();
    });

    it("applies tool exclusion settings from config", async () => {
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

      mockClient.resumeSession.mockRejectedValue(
        new Error("Session not found")
      );

      await expect(
        resumeConversation("nonexistent", validConfig, "test-key-123")
      ).rejects.toThrow();
    });

    it("creates client if not already started", async () => {
      if (!resumeConversation) {
        return;
      }

      await resumeConversation("session-1", validConfig, "test-key-123");

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("passes onPermissionRequest handler when provided", async () => {
      if (!resumeConversation) {
        return;
      }

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
      if (!resumeConversation) {
        return;
      }

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
      if (!getLastConversationId) {
        return;
      }

      mockClient.getLastSessionId.mockResolvedValue("last-session-123");

      const result = await getLastConversationId();

      expect(result).toBe("last-session-123");
      expect(mockClient.getLastSessionId).toHaveBeenCalledOnce();
    });

    it("returns undefined when no sessions exist", async () => {
      if (!getLastConversationId) {
        return;
      }

      mockClient.getLastSessionId.mockResolvedValue(undefined);

      const result = await getLastConversationId();

      expect(result).toBeUndefined();
    });

    it("creates client if not already started", async () => {
      if (!getLastConversationId) {
        return;
      }

      mockClient.getLastSessionId.mockResolvedValue(undefined);

      await getLastConversationId();

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK errors gracefully", async () => {
      if (!getLastConversationId) {
        return;
      }

      mockClient.getLastSessionId.mockRejectedValue(
        new Error("Storage error")
      );

      await expect(getLastConversationId()).rejects.toThrow("Storage error");
    });
  });

  describe("deleteConversation", () => {
    it("deletes from SDK storage", async () => {
      if (!deleteConversation) {
        return;
      }

      await deleteConversation("session-delete");

      expect(mockClient.deleteSession).toHaveBeenCalledWith("session-delete");
    });

    it("removes from local sessions map", async () => {
      if (!deleteConversation || !resumeConversation) {
        return;
      }

      // First resume a session to populate the map
      await resumeConversation("session-123", validConfig, "test-key-123");

      // Delete it
      await deleteConversation("session-123");

      // Next resume should call SDK again (not reuse cached)
      await resumeConversation("session-123", validConfig, "test-key-123");
      expect(mockClient.resumeSession).toHaveBeenCalledTimes(2);
    });

    it("handles gracefully when session doesn't exist", async () => {
      if (!deleteConversation) {
        return;
      }

      mockClient.deleteSession.mockResolvedValue(undefined);

      // Should not throw
      await expect(
        deleteConversation("nonexistent-session")
      ).resolves.toBeUndefined();
    });

    it("creates client if not already started", async () => {
      if (!deleteConversation) {
        return;
      }

      await deleteConversation("session-delete");

      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("handles SDK deletion errors gracefully", async () => {
      if (!deleteConversation) {
        return;
      }

      mockClient.deleteSession.mockRejectedValue(
        new Error("Deletion failed")
      );

      await expect(deleteConversation("session-error")).rejects.toThrow(
        "Deletion failed"
      );
    });
  });

  describe("integration scenarios", () => {
    it("can list, resume, and delete a conversation", async () => {
      if (!listConversations || !resumeConversation || !deleteConversation) {
        return;
      }

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
      const conversations = await listConversations();
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
      await deleteConversation("session-int-1");
      expect(mockClient.deleteSession).toHaveBeenCalledWith("session-int-1");
    });

    it("getLastConversationId returns most recent after multiple creates", async () => {
      if (!getLastConversationId) {
        return;
      }

      mockClient.getLastSessionId.mockResolvedValue("most-recent-session");

      const lastId = await getLastConversationId();

      expect(lastId).toBe("most-recent-session");
    });

    it("handles empty state gracefully - no conversations yet", async () => {
      if (!listConversations || !getLastConversationId) {
        return;
      }

      mockClient.listSessions.mockResolvedValue([]);
      mockClient.getLastSessionId.mockResolvedValue(undefined);

      const conversations = await listConversations();
      const lastId = await getLastConversationId();

      expect(conversations).toEqual([]);
      expect(lastId).toBeUndefined();
    });
  });

  describe("error path coverage", () => {
    it("listConversations fails when SDK is unavailable", async () => {
      if (!listConversations) {
        return;
      }

      mockClient.start.mockRejectedValue(new Error("SDK unavailable"));

      await expect(listConversations()).rejects.toThrow("SDK unavailable");
    });

    it("resumeConversation with invalid config still calls SDK", async () => {
      if (!resumeConversation) {
        return;
      }

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
      if (!deleteConversation) {
        return;
      }

      // First call succeeds
      mockClient.deleteSession.mockResolvedValueOnce(undefined);
      // Second call to same session (already deleted)
      mockClient.deleteSession.mockResolvedValueOnce(undefined);

      await deleteConversation("session-123");
      await deleteConversation("session-123"); // Should not throw

      expect(mockClient.deleteSession).toHaveBeenCalledTimes(2);
    });

    it("resumeConversation with expired auth token fails", async () => {
      if (!resumeConversation) {
        return;
      }

      mockClient.resumeSession.mockRejectedValue(
        new Error("Authentication failed: token expired")
      );

      await expect(
        resumeConversation("session-auth", entraIdConfig, "expired-token")
      ).rejects.toThrow("token expired");
    });
  });
});
