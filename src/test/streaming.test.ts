import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import { stopClient } from "../copilotService.js";
import { activate } from "../extension.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

describe("streaming smoothness (SC7)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let capturedHandler: (
    request: unknown,
    context: unknown,
    stream: unknown,
    token: unknown
  ) => Promise<void>;
  let stream: { markdown: ReturnType<typeof vi.fn>; button: ReturnType<typeof vi.fn> };
  let token: {
    isCancellationRequested: boolean;
    onCancellationRequested: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);

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

    const mockContext = {
      subscriptions: [] as { dispose: () => void }[],
    };
    activate(mockContext as unknown as import("vscode").ExtensionContext);

    const calls = vi.mocked(vscode.chat.createChatParticipant).mock.calls;
    capturedHandler = calls[calls.length - 1][1] as typeof capturedHandler;

    stream = { markdown: vi.fn(), button: vi.fn() };
    token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    };
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.chat.createChatParticipant).mockClear();
  });

  describe("incremental token delivery (no buffering)", () => {
    it("calls stream.markdown() for each token immediately", async () => {
      const request = { prompt: "Test prompt" };
      const context = { id: "test-conv-1" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Token1 " } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Token2 " } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Token3" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(3);
      expect(stream.markdown).toHaveBeenNthCalledWith(1, "Token1 ");
      expect(stream.markdown).toHaveBeenNthCalledWith(2, "Token2 ");
      expect(stream.markdown).toHaveBeenNthCalledWith(3, "Token3");
    });

    it("does not buffer tokens before calling stream.markdown()", async () => {
      const request = { prompt: "Test prompt" };
      const context = { id: "test-conv-2" };

      const callOrder: string[] = [];
      stream.markdown.mockImplementation((content: string) => {
        callOrder.push(content);
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "First" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Second" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(callOrder).toEqual(["First", "Second"]);
    });
  });

  describe("variable-length response handling", () => {
    it("streams short responses (1-3 tokens) correctly", async () => {
      const request = { prompt: "Short test" };
      const context = { id: "test-conv-3" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Brief" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(1);
      expect(stream.markdown).toHaveBeenCalledWith("Brief");
    });

    it("streams medium responses (10-20 tokens) correctly", async () => {
      const request = { prompt: "Medium test" };
      const context = { id: "test-conv-4" };

      mockSession.sendMessage.mockImplementation(async () => {
        for (let i = 0; i < 15; i++) {
          mockSession._emit("assistant.message_delta", { delta: { content: `token${i} ` } });
        }
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(15);
    });

    it("streams long responses (50+ tokens) correctly", async () => {
      const request = { prompt: "Long test" };
      const context = { id: "test-conv-5" };

      mockSession.sendMessage.mockImplementation(async () => {
        for (let i = 0; i < 75; i++) {
          mockSession._emit("assistant.message_delta", { delta: { content: `t${i} ` } });
        }
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(75);
    });
  });

  describe("token ordering guarantees", () => {
    it("preserves exact order of tokens in stream.markdown calls", async () => {
      const request = { prompt: "Order test" };
      const context = { id: "test-conv-6" };

      const receivedTokens: string[] = [];
      stream.markdown.mockImplementation((content: string) => {
        receivedTokens.push(content);
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "First " } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Second " } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Third " } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Fourth" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(receivedTokens).toEqual(["First ", "Second ", "Third ", "Fourth"]);
    });

    it("maintains order with interleaved events", async () => {
      const request = { prompt: "Interleave test" };
      const context = { id: "test-conv-7" };

      const receivedTokens: string[] = [];
      stream.markdown.mockImplementation((content: string) => {
        receivedTokens.push(content);
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "A" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "B" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "C" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(receivedTokens).toEqual(["A", "B", "C"]);
    });
  });

  describe("rapid sequential tokens", () => {
    it("handles rapid-fire token emission without dropping tokens", async () => {
      const request = { prompt: "Rapid test" };
      const context = { id: "test-conv-8" };

      mockSession.sendMessage.mockImplementation(async () => {
        // Emit 30 tokens rapidly in sequence
        for (let i = 0; i < 30; i++) {
          mockSession._emit("assistant.message_delta", { delta: { content: `r${i} ` } });
        }
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(30);
      for (let i = 0; i < 30; i++) {
        expect(stream.markdown).toHaveBeenCalledWith(`r${i} `);
      }
    });

    it("processes back-to-back tokens without artificial delay", async () => {
      const request = { prompt: "Back-to-back test" };
      const context = { id: "test-conv-9" };

      const timestamps: number[] = [];
      stream.markdown.mockImplementation(() => {
        timestamps.push(Date.now());
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "One" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Two" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Three" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      // All calls should happen in rapid succession (< 10ms)
      expect(timestamps.length).toBe(3);
      const maxDelta = Math.max(
        timestamps[1] - timestamps[0],
        timestamps[2] - timestamps[1]
      );
      expect(maxDelta).toBeLessThan(10);
    });
  });

  describe("empty token handling", () => {
    it("handles empty string tokens gracefully", async () => {
      const request = { prompt: "Empty token test" };
      const context = { id: "test-conv-10" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "Real token" } });
        mockSession._emit("assistant.message_delta", { delta: { content: "" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      // Empty tokens should not crash, but stream.markdown is only called for non-empty content
      expect(stream.markdown).toHaveBeenCalledWith("Real token");
    });

    it("handles missing delta.content field", async () => {
      const request = { prompt: "Missing content test" };
      const context = { id: "test-conv-11" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: {} });
        mockSession._emit("assistant.message_delta", { delta: { content: "Valid" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      // Should only call markdown for valid content
      expect(stream.markdown).toHaveBeenCalledTimes(1);
      expect(stream.markdown).toHaveBeenCalledWith("Valid");
    });

    it("handles null or undefined delta", async () => {
      const request = { prompt: "Null delta test" };
      const context = { id: "test-conv-12" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: null });
        mockSession._emit("assistant.message_delta", {});
        mockSession._emit("assistant.message_delta", { delta: { content: "Good" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(stream.markdown).toHaveBeenCalledTimes(1);
      expect(stream.markdown).toHaveBeenCalledWith("Good");
    });
  });

  describe("cancellation during streaming", () => {
    it("calls session.abort() when cancellation is requested mid-stream", async () => {
      const request = { prompt: "Cancel test" };
      const context = { id: "test-conv-13" };

      let cancelCallback: (() => void) | undefined;
      token.onCancellationRequested.mockImplementation((callback) => {
        cancelCallback = callback;
        return { dispose: vi.fn() };
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Before cancel" } });
        if (cancelCallback) cancelCallback();
        mockSession._emit("assistant.message_delta", { delta: { content: "After cancel" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(mockSession.abort).toHaveBeenCalledTimes(1);
    });

    it("continues streaming after abort is called", async () => {
      const request = { prompt: "Cancel continue test" };
      const context = { id: "test-conv-14" };

      let cancelCallback: (() => void) | undefined;
      token.onCancellationRequested.mockImplementation((callback) => {
        cancelCallback = callback;
        return { dispose: vi.fn() };
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Token1" } });
        if (cancelCallback) cancelCallback();
        mockSession._emit("assistant.message_delta", { delta: { content: "Token2" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      // Both tokens should be received even though abort was called
      expect(stream.markdown).toHaveBeenCalledWith("Token1");
      expect(stream.markdown).toHaveBeenCalledWith("Token2");
    });

    it("ignores abort errors gracefully", async () => {
      const request = { prompt: "Abort error test" };
      const context = { id: "test-conv-15" };

      let cancelCallback: (() => void) | undefined;
      token.onCancellationRequested.mockImplementation((callback) => {
        cancelCallback = callback;
        return { dispose: vi.fn() };
      });

      mockSession.abort.mockImplementation(() => {
        throw new Error("Abort failed");
      });

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Token" } });
        if (cancelCallback) cancelCallback();
        mockSession._emit("session.idle");
      });

      await expect(capturedHandler(request, context, stream, token)).resolves.not.toThrow();
      expect(stream.markdown).toHaveBeenCalledWith("Token");
    });
  });

  describe("streaming mechanics verification", () => {
    it("registers assistant.message_delta listener before sending message", async () => {
      const request = { prompt: "Listener order test" };
      const context = { id: "test-conv-16" };

      // Verify listener is registered and functional
      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", { delta: { content: "Test" } });
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      // Listener was registered because we got the markdown call
      expect(stream.markdown).toHaveBeenCalledWith("Test");
      expect(mockSession.on).toHaveBeenCalledWith("assistant.message_delta", expect.any(Function));
    });

    it("removes message_delta listener after session.idle", async () => {
      const request = { prompt: "Cleanup test" };
      const context = { id: "test-conv-17" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      await capturedHandler(request, context, stream, token);

      expect(mockSession.off).toHaveBeenCalledWith(
        "assistant.message_delta",
        expect.any(Function)
      );
    });

    it("removes message_delta listener after session.error", async () => {
      const request = { prompt: "Error cleanup test" };
      const context = { id: "test-conv-18" };

      mockSession.sendMessage.mockImplementation(async () => {
        mockSession._emit("session.error", { error: { message: "Test error" } });
      });

      await capturedHandler(request, context, stream, token);
      
      // Verify error was displayed in the stream
      expect(stream.markdown).toHaveBeenCalledWith(
        expect.stringContaining("Test error")
      );
      
      // Verify listener cleanup happened
      expect(mockSession.off).toHaveBeenCalledWith(
        "assistant.message_delta",
        expect.any(Function)
      );
    });
  });
});
