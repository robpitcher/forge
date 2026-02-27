import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import type { ExtensionConfig } from "../configuration.js";
import {
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

      await resultA.sendMessage({ role: "user", content: "message A" });
      await resultB.sendMessage({ role: "user", content: "message B" });

      expect(sessionA.sendMessage).toHaveBeenCalledWith({
        role: "user",
        content: "message A",
      });
      expect(sessionB.sendMessage).toHaveBeenCalledWith({
        role: "user",
        content: "message B",
      });
    });
  });

  describe("session persists across messages", () => {
    it("accepts multiple sendMessage calls on the same session", async () => {
      const session = await getOrCreateSession("conv-multi", validConfig);

      await session.sendMessage({ role: "user", content: "first message" });
      await session.sendMessage({ role: "user", content: "second message" });
      await session.sendMessage({ role: "user", content: "third message" });

      expect(session.sendMessage).toHaveBeenCalledTimes(3);
      expect(session.sendMessage).toHaveBeenNthCalledWith(1, {
        role: "user",
        content: "first message",
      });
      expect(session.sendMessage).toHaveBeenNthCalledWith(2, {
        role: "user",
        content: "second message",
      });
      expect(session.sendMessage).toHaveBeenNthCalledWith(3, {
        role: "user",
        content: "third message",
      });
    });

    it("returns the same session after intermediate messages", async () => {
      const session1 = await getOrCreateSession("conv-persist", validConfig);
      await session1.sendMessage({ role: "user", content: "turn 1" });

      const session2 = await getOrCreateSession("conv-persist", validConfig);
      await session2.sendMessage({ role: "user", content: "turn 2" });

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

  describe("conversation ID generation", () => {
    let capturedHandler: (
      request: unknown,
      context: unknown,
      stream: unknown,
      token: unknown
    ) => Promise<void>;

    beforeEach(async () => {
      const { activate } = await import("../extension.js");

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

      vi.mocked(vscode.chat.createChatParticipant).mockReturnValue({
        iconPath: null,
        dispose: vi.fn(),
      } as unknown as ReturnType<typeof vscode.chat.createChatParticipant>);

      const mockExtCtx = {
        subscriptions: [] as { dispose: () => void }[],
      };
      activate(mockExtCtx as unknown as import("vscode").ExtensionContext);

      const calls = vi.mocked(vscode.chat.createChatParticipant).mock.calls;
      capturedHandler = calls[calls.length - 1][1] as typeof capturedHandler;
    });

    afterEach(() => {
      vi.mocked(vscode.chat.createChatParticipant).mockClear();
    });

    function makeStream() {
      return { markdown: vi.fn(), button: vi.fn() };
    }

    function makeToken() {
      return {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };
    }

    it("uses context.id when it is a valid string", async () => {
      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      const context1 = { id: "stable-id" };
      await capturedHandler({ prompt: "hi" }, context1, makeStream(), makeToken());
      await capturedHandler({ prompt: "again" }, context1, makeStream(), makeToken());

      expect(mockClient.createSession).toHaveBeenCalledOnce();
    });

    it("generates a fallback ID when context.id is undefined", async () => {
      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      await capturedHandler({ prompt: "hi" }, {}, makeStream(), makeToken());
      await capturedHandler({ prompt: "again" }, {}, makeStream(), makeToken());

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("generates a fallback ID when context.id is empty string", async () => {
      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      await capturedHandler({ prompt: "hi" }, { id: "" }, makeStream(), makeToken());
      await capturedHandler({ prompt: "again" }, { id: "" }, makeStream(), makeToken());

      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });

    it("generates a fallback ID when context.id is a non-string value", async () => {
      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      await capturedHandler({ prompt: "hi" }, { id: 42 }, makeStream(), makeToken());

      expect(mockClient.createSession).toHaveBeenCalledOnce();
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
