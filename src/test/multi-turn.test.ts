import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import {
  getOrCreateSession,
  removeSession,
  stopClient,
} from "../copilotService.js";
import { activate } from "../extension.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  createMockWebviewView,
  createMockResolveContext,
  createMockCancellationToken,
  simulateUserMessage,
  simulateNewConversation,
  getPostedMessagesOfType,
  type MockWebviewView,
} from "./webview-test-helpers.js";

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

describe("multi-turn conversation context (SC4)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
  });

  describe("same conversation reuses session", () => {
    it("returns the same session object for the same conversationId", async () => {
      const session1 = await getOrCreateSession("conv-reuse", validConfig);
      const session2 = await getOrCreateSession("conv-reuse", validConfig);

      expect(session1).toBe(session2);
    });

    it("only calls createSession once for repeated requests", async () => {
      await getOrCreateSession("conv-reuse", validConfig);
      await getOrCreateSession("conv-reuse", validConfig);
      await getOrCreateSession("conv-reuse", validConfig);

      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });
  });

  describe("different conversations get different sessions", () => {
    it("creates separate sessions for distinct conversationIds", async () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();
      let idx = 0;
      const mocks = [sessionA, sessionB];
      mockClient.createSession.mockImplementation(async () => mocks[idx++]);

      const resultA = await getOrCreateSession("conv-A", validConfig);
      const resultB = await getOrCreateSession("conv-B", validConfig);

      expect(resultA).not.toBe(resultB);
      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("does not cross-contaminate sessions between conversations", async () => {
      const sessionA = createMockSession();
      const sessionB = createMockSession();
      let idx = 0;
      const mocks = [sessionA, sessionB];
      mockClient.createSession.mockImplementation(async () => mocks[idx++]);

      const resultA = await getOrCreateSession("conv-A", validConfig);
      const resultB = await getOrCreateSession("conv-B", validConfig);

      await resultA.send({ prompt: "message A" });
      await resultB.send({ prompt: "message B" });

      expect(sessionA.send).toHaveBeenCalledWith({
        
        prompt: "message A",
      });
      expect(sessionB.send).toHaveBeenCalledWith({
        
        prompt: "message B",
      });
    });
  });

  describe("session persists across messages", () => {
    it("accepts multiple sendMessage calls on the same session", async () => {
      const session = await getOrCreateSession("conv-multi", validConfig);

      await session.send({ prompt: "first message" });
      await session.send({ prompt: "second message" });
      await session.send({ prompt: "third message" });

      expect(session.send).toHaveBeenCalledTimes(3);
      expect(session.send).toHaveBeenNthCalledWith(1, {
        
        prompt: "first message",
      });
      expect(session.send).toHaveBeenNthCalledWith(2, {
        
        prompt: "second message",
      });
      expect(session.send).toHaveBeenNthCalledWith(3, {
        
        prompt: "third message",
      });
    });

    it("returns the same session after intermediate messages", async () => {
      const session1 = await getOrCreateSession("conv-persist", validConfig);
      await session1.send({ prompt: "turn 1" });

      const session2 = await getOrCreateSession("conv-persist", validConfig);
      await session2.send({ prompt: "turn 2" });

      expect(session1).toBe(session2);
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });
  });

  describe("session cleanup", () => {
    it("removeSession removes a specific session", async () => {
      await getOrCreateSession("conv-remove", validConfig);
      removeSession("conv-remove");

      await getOrCreateSession("conv-remove", validConfig);
      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("removeSession leaves other sessions intact", async () => {
      const sessionKeep = await getOrCreateSession("conv-keep", validConfig);
      await getOrCreateSession("conv-remove", validConfig);

      removeSession("conv-remove");

      const sessionKeepAgain = await getOrCreateSession("conv-keep", validConfig);
      expect(sessionKeepAgain).toBe(sessionKeep);
      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("removeSession on non-existent session is a no-op", () => {
      expect(() => removeSession("conv-nonexistent")).not.toThrow();
    });
  });

  // --- WebviewView-specific conversation ID tests ---
  describe("internal conversation ID via WebviewViewProvider", () => {
    let capturedProvider: {
      resolveWebviewView: (
        view: unknown,
        context: unknown,
        token: unknown
      ) => void;
    };
    let mockView: MockWebviewView;

    function setupValidSettings() {
      const settings: Record<string, string> = {
        endpoint: "https://myresource.openai.azure.com/openai/v1/",
        apiKey: "test-key-123",
        model: "gpt-4.1",
        wireApi: "completions",
        cliPath: "",
      };
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(
          (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
        ),
      } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
    }

    beforeEach(() => {
      setupValidSettings();

      const mockExtCtx = {
        subscriptions: [] as { dispose: () => void }[],
        extensionUri: { toString: () => "mock-ext-uri" },
        secrets: {
          get: vi.fn().mockImplementation((key: string) =>
            key === "enclave.copilot.apiKey" ? Promise.resolve("test-key-123") : Promise.resolve(undefined)
          ),
          store: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        },
      };
      activate(mockExtCtx as unknown as import("vscode").ExtensionContext);

      const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
      capturedProvider = calls[calls.length - 1][1] as typeof capturedProvider;

      mockView = createMockWebviewView();
      capturedProvider.resolveWebviewView(
        mockView,
        createMockResolveContext(),
        createMockCancellationToken()
      );
    });

    afterEach(() => {
      vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
    });

    it("same provider instance reuses conversation ID across messages", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "first message");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(1);
      });

      simulateUserMessage(mockView, "second message");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(2);
      });

      // Session created only once = same conversation ID reused
      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("newConversation command generates new conversation ID", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "first message");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(1);
      });

      // New conversation resets the ID
      simulateNewConversation(mockView);
      await vi.waitFor(() => {
        const resets = getPostedMessagesOfType(mockView, "conversationReset");
        expect(resets.length).toBe(1);
      });

      // New session should be created for the next message
      const newSession = createMockSession();
      newSession.send.mockImplementation(async () => {
        newSession._emit("session.idle");
      });
      mockClient.createSession.mockResolvedValueOnce(newSession);

      simulateUserMessage(mockView, "after reset");
      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalledTimes(2);
      });
    });

    it("session is reused for messages within same conversation", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "message 1");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(1);
      });

      simulateUserMessage(mockView, "message 2");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(2);
      });

      simulateUserMessage(mockView, "message 3");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(3);
      });

      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("new session created after newConversation command", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "before reset");
      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalledTimes(1);
      });

      simulateNewConversation(mockView);

      // Wait for conversationReset confirming destroySession completed
      await vi.waitFor(() => {
        const resets = getPostedMessagesOfType(mockView, "conversationReset");
        expect(resets.length).toBe(1);
      });

      const freshSession = createMockSession();
      freshSession.send.mockImplementation(async () => {
        freshSession._emit("session.idle");
      });
      mockClient.createSession.mockResolvedValueOnce(freshSession);

      simulateUserMessage(mockView, "after reset");
      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("multiple concurrent sessions", () => {
    it("creates and manages many sessions independently", async () => {
      const ids = ["conv-1", "conv-2", "conv-3", "conv-4", "conv-5"];

      const sessionMap = new Map<string, ReturnType<typeof createMockSession>>();
      for (const id of ids) {
        sessionMap.set(id, createMockSession());
      }

      let callIdx = 0;
      mockClient.createSession.mockImplementation(async () => {
        return sessionMap.get(ids[callIdx++]);
      });

      // Create sessions sequentially to avoid client-creation race
      const sessions = [];
      for (const id of ids) {
        sessions.push(await getOrCreateSession(id, validConfig));
      }

      expect(mockClient.createSession).toHaveBeenCalledTimes(5);

      // Each session is independently reachable and reused
      for (let i = 0; i < ids.length; i++) {
        const refetched = await getOrCreateSession(ids[i], validConfig);
        expect(refetched).toBe(sessions[i]);
      }

      expect(mockClient.createSession).toHaveBeenCalledTimes(5);
    });

    it("removing one session does not affect others", async () => {
      const s1 = createMockSession();
      const s2 = createMockSession();
      const s3 = createMockSession();

      let idx = 0;
      const mocks = [s1, s2, s3];
      mockClient.createSession.mockImplementation(async () => mocks[idx++]);

      const session1 = await getOrCreateSession("c1", validConfig);
      const session2 = await getOrCreateSession("c2", validConfig);
      const session3 = await getOrCreateSession("c3", validConfig);

      removeSession("c2");

      expect(await getOrCreateSession("c1", validConfig)).toBe(session1);
      expect(await getOrCreateSession("c3", validConfig)).toBe(session3);

      const session2New = await getOrCreateSession("c2", validConfig);
      expect(session2New).not.toBe(session2);
      expect(mockClient.createSession).toHaveBeenCalledTimes(4);
    });
  });
});
